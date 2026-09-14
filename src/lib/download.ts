/** Same-origin file download that still works on iOS Safari after async work. */
export function triggerFileDownload(filename: string, mime: string, body: string) {
  const type = mime.includes("csv") ? "text/csv;charset=utf-8" : mime || "application/octet-stream";
  const payload = mime.includes("csv") && !body.startsWith("\uFEFF") ? `\uFEFF${body}` : body;
  const blob = new Blob([payload], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "norf-export.csv";
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  const iOS =
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (iOS) window.open(url, "_blank", "noopener");
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 30_000);
}

/** Keep this in the click stack so iOS treats it as a user gesture. */
export function triggerUrlDownload(href: string, filename = "norf-export.csv") {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
