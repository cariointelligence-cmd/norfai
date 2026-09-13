//! NORF HTML extract daemon. Std-only Rust. Binds 127.0.0.1:18765.
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::thread;
use std::time::Duration;

const ADDR: &str = "127.0.0.1:18765";

fn esc(s: &str) -> String {
    let mut o = String::with_capacity(s.len() + 8);
    for c in s.chars() {
        match c {
            '"' => o.push_str("\\\""),
            '\\' => o.push_str("\\\\"),
            '\n' => o.push_str("\\n"),
            '\r' => o.push_str("\\r"),
            '\t' => o.push_str("\\t"),
            c if c.is_control() => {}
            c => o.push(c),
        }
    }
    o
}

fn is_email_char(c: u8) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, b'.' | b'_' | b'%' | b'+' | b'-')
}

fn extract_emails(html: &str) -> Vec<String> {
    let b = html.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'@' && i > 0 && i + 3 < b.len() {
            let mut l = i;
            while l > 0 && is_email_char(b[l - 1]) {
                l -= 1;
            }
            let mut r = i + 1;
            while r < b.len() && (is_email_char(b[r]) || b[r] == b'.') {
                r += 1;
            }
            if r > i + 3 && b[i + 1].is_ascii_alphabetic() {
                let s = html[l..r].to_ascii_lowercase();
                if s.contains('.') && !out.iter().any(|e: &String| e == &s) && s.len() < 80 {
                    out.push(s);
                }
            }
        }
        i += 1;
        if out.len() >= 24 {
            break;
        }
    }
    out
}

fn extract_phones(html: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut buf = String::new();
    for ch in html.chars() {
        if ch.is_ascii_digit() || ch == '+' {
            buf.push(ch);
        } else if matches!(ch, ' ' | '-' | '(' | ')' | '.' | '/') {
            /* keep Finnish formatted numbers together */
        } else if !buf.is_empty() {
            take_phone(&mut out, &buf);
            buf.clear();
        }
    }
    if !buf.is_empty() {
        take_phone(&mut out, &buf);
    }
    out
}

fn take_phone(out: &mut Vec<String>, raw: &str) {
    if out.len() >= 16 {
        return;
    }
    let digits: String = raw.chars().filter(|c| c.is_ascii_digit() || *c == '+').collect();
    let n = if digits.starts_with("358") && digits.len() >= 11 {
        format!("+{digits}")
    } else if digits.starts_with("0") && digits.len() >= 9 && digits.len() <= 12 {
        format!("+358{}", &digits[1..])
    } else if digits.starts_with("+358") && digits.len() >= 12 {
        digits
    } else {
        return;
    };
    if !out.iter().any(|p| p == &n) {
        out.push(n);
    }
}

fn extract_title(html: &str) -> String {
    let lower = html.to_ascii_lowercase();
    if let Some(a) = lower.find("<title") {
        if let Some(gt) = html[a..].find('>') {
            let start = a + gt + 1;
            if let Some(end_rel) = lower[start..].find("</title>") {
                return html[start..start + end_rel].trim().chars().take(160).collect();
            }
        }
    }
    String::new()
}

fn extract_json(html: &str) -> String {
    let emails = extract_emails(html);
    let phones = extract_phones(html);
    let title = extract_title(html);
    let mut s = String::from("{\"ok\":true,\"title\":\"");
    s.push_str(&esc(&title));
    s.push_str("\",\"emails\":[");
    for (i, e) in emails.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        s.push('"');
        s.push_str(&esc(e));
        s.push('"');
    }
    s.push_str("],\"phones\":[");
    for (i, p) in phones.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        s.push('"');
        s.push_str(&esc(p));
        s.push('"');
    }
    s.push_str("]}");
    s
}

fn read_req(s: &mut TcpStream) -> Option<(String, Vec<u8>)> {
    s.set_read_timeout(Some(Duration::from_millis(2500))).ok()?;
    let mut buf = Vec::with_capacity(8192);
    let mut tmp = [0u8; 4096];
    loop {
        let n = s.read(&mut tmp).ok()?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&tmp[..n]);
        if buf.windows(4).any(|w| w == b"\r\n\r\n") {
            break;
        }
        if buf.len() > 32_000 {
            return None;
        }
    }
    let header_end = buf.windows(4).position(|w| w == b"\r\n\r\n")?;
    let header = std::str::from_utf8(&buf[..header_end]).ok()?.to_string();
    let mut content_len = 0usize;
    for line in header.lines() {
        if line.to_ascii_lowercase().starts_with("content-length:") {
            content_len = line.split(':').nth(1)?.trim().parse().unwrap_or(0);
        }
    }
    content_len = content_len.min(1_500_000);
    let mut body = buf[header_end + 4..].to_vec();
    while body.len() < content_len {
        let n = s.read(&mut tmp).ok()?;
        if n == 0 {
            break;
        }
        body.extend_from_slice(&tmp[..n]);
        if body.len() > 1_500_000 {
            break;
        }
    }
    if body.len() > content_len {
        body.truncate(content_len);
    }
    Some((header, body))
}

fn handle(mut s: TcpStream) {
    let Some((header, body)) = read_req(&mut s) else {
        return;
    };
    let first = header.lines().next().unwrap_or("");
    let (status, payload) = if first.starts_with("GET /health") {
        ("200 OK", b"{\"ok\":true,\"engine\":\"rust-extract\"}".to_vec())
    } else if first.starts_with("POST /extract") {
        let html = String::from_utf8_lossy(&body);
        ("200 OK", extract_json(&html).into_bytes())
    } else {
        ("404 Not Found", b"{\"ok\":false}".to_vec())
    };
    let resp = format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        payload.len()
    );
    let _ = s.write_all(resp.as_bytes());
    let _ = s.write_all(&payload);
}

fn main() {
    let listener = match TcpListener::bind(ADDR) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("norf-extract bind {e}");
            std::process::exit(1);
        }
    };
    eprintln!("norf-extract {ADDR}");
    for stream in listener.incoming() {
        if let Ok(s) = stream {
            thread::spawn(move || handle(s));
        }
    }
}
