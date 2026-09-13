/* FNV-1a 64. Reads stdin, prints 16 hex chars. */
#include <stdio.h>
#include <stdint.h>

int main(void) {
    uint64_t h = 14695981039346656037ULL;
    int c;
    while ((c = fgetc(stdin)) != EOF) {
        h ^= (uint8_t)c;
        h *= 1099511628211ULL;
    }
    printf("%016llx\n", (unsigned long long)h);
    return 0;
}
