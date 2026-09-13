/* Weighted clamp score. stdin: one "key earned" line per part, last line "total_weight W". */
#include <iostream>
#include <sstream>
#include <string>
#include <algorithm>
#include <cmath>

int main() {
    std::string line;
    double earned = 0.0;
    double weight = 0.0;
    while (std::getline(std::cin, line)) {
        if (line.empty()) continue;
        std::istringstream in(line);
        std::string key;
        double v = 0.0;
        if (!(in >> key >> v)) continue;
        if (key == "total_weight") weight = v;
        else earned += v;
    }
    if (weight <= 0) weight = 100.0;
    double pct = 100.0 * earned / weight;
    if (pct < 0) pct = 0;
    if (pct > 100) pct = 100;
    std::cout << "{\"score\":" << (int)std::lround(pct) << ",\"earned\":" << earned << "}\n";
    return 0;
}
