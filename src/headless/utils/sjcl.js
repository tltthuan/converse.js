"use strict";

function l(a) {
    throw a;
}
var r = void 0,
    s = !1;
var sjcl = {
    cipher: {},
    hash: {},
    keyexchange: {},
    mode: {},
    misc: {},
    codec: {},
    exception: {
        corrupt: function(a) {
            this.toString = function() {
                return "CORRUPT: " + this.message
            };
            this.message = a
        },
        invalid: function(a) {
            this.toString = function() {
                return "INVALID: " + this.message
            };
            this.message = a
        },
        bug: function(a) {
            this.toString = function() {
                return "BUG: " + this.message
            };
            this.message = a
        },
        notReady: function(a) {
            this.toString = function() {
                return "NOT READY: " + this.message
            };
            this.message = a
        }
    }
};
"undefined" !== typeof module && module.exports && (module.exports = sjcl);
sjcl.cipher.aes = function(a) {
    this.l[0][0][0] || this.D();
    var b, c, d, e, f = this.l[0][4],
        g = this.l[1];
    b = a.length;
    var h = 1;
    4 !== b && (6 !== b && 8 !== b) && l(new sjcl.exception.invalid("invalid aes key size"));
    this.b = [d = a.slice(0), e = []];
    for (a = b; a < 4 * b + 28; a++) {
        c = d[a - 1];
        if (0 === a % b || 8 === b && 4 === a % b) c = f[c >>> 24] << 24 ^ f[c >> 16 & 255] << 16 ^ f[c >> 8 & 255] << 8 ^ f[c & 255], 0 === a % b && (c = c << 8 ^ c >>> 24 ^ h << 24, h = h << 1 ^ 283 * (h >> 7));
        d[a] = d[a - b] ^ c
    }
    for (b = 0; a; b++, a--) c = d[b & 3 ? a : a - 4], e[b] = 4 >= a || 4 > b ? c : g[0][f[c >>> 24]] ^ g[1][f[c >> 16 & 255]] ^ g[2][f[c >> 8 & 255]] ^ g[3][f[c &
        255]]
};
sjcl.cipher.aes.prototype = {
    encrypt: function(a) {
        return y(this, a, 0)
    },
    decrypt: function(a) {
        return y(this, a, 1)
    },
    l: [
        [
            [],
            [],
            [],
            [],
            []
        ],
        [
            [],
            [],
            [],
            [],
            []
        ]
    ],
    D: function() {
        var a = this.l[0],
            b = this.l[1],
            c = a[4],
            d = b[4],
            e, f, g, h = [],
            k = [],
            m, p, n, q;
        for (e = 0; 0x100 > e; e++) k[(h[e] = e << 1 ^ 283 * (e >> 7)) ^ e] = e;
        for (f = g = 0; !c[f]; f ^= m || 1, g = k[g] || 1) {
            n = g ^ g << 1 ^ g << 2 ^ g << 3 ^ g << 4;
            n = n >> 8 ^ n & 255 ^ 99;
            c[f] = n;
            d[n] = f;
            p = h[e = h[m = h[f]]];
            q = 0x1010101 * p ^ 0x10001 * e ^ 0x101 * m ^ 0x1010100 * f;
            p = 0x101 * h[n] ^ 0x1010100 * n;
            for (e = 0; 4 > e; e++) a[e][f] = p = p << 24 ^ p >>> 8, b[e][n] = q = q << 24 ^ q >>> 8
        }
        for (e =
            0; 5 > e; e++) a[e] = a[e].slice(0), b[e] = b[e].slice(0)
    }
};

function y(a, b, c) {
    4 !== b.length && l(new sjcl.exception.invalid("invalid aes block size"));
    var d = a.b[c],
        e = b[0] ^ d[0],
        f = b[c ? 3 : 1] ^ d[1],
        g = b[2] ^ d[2];
    b = b[c ? 1 : 3] ^ d[3];
    var h, k, m, p = d.length / 4 - 2,
        n, q = 4,
        t = [0, 0, 0, 0];
    h = a.l[c];
    a = h[0];
    var u = h[1],
        v = h[2],
        w = h[3],
        x = h[4];
    for (n = 0; n < p; n++) h = a[e >>> 24] ^ u[f >> 16 & 255] ^ v[g >> 8 & 255] ^ w[b & 255] ^ d[q], k = a[f >>> 24] ^ u[g >> 16 & 255] ^ v[b >> 8 & 255] ^ w[e & 255] ^ d[q + 1], m = a[g >>> 24] ^ u[b >> 16 & 255] ^ v[e >> 8 & 255] ^ w[f & 255] ^ d[q + 2], b = a[b >>> 24] ^ u[e >> 16 & 255] ^ v[f >> 8 & 255] ^ w[g & 255] ^ d[q + 3], q += 4, e = h, f = k, g = m;
    for (n = 0; 4 >
        n; n++) t[c ? 3 & -n : n] = x[e >>> 24] << 24 ^ x[f >> 16 & 255] << 16 ^ x[g >> 8 & 255] << 8 ^ x[b & 255] ^ d[q++], h = e, e = f, f = g, g = b, b = h;
    return t
}
sjcl.bitArray = {
    bitSlice: function(a, b, c) {
        a = sjcl.bitArray.O(a.slice(b / 32), 32 - (b & 31)).slice(1);
        return c === r ? a : sjcl.bitArray.clamp(a, c - b)
    },
    extract: function(a, b, c) {
        var d = Math.floor(-b - c & 31);
        return ((b + c - 1 ^ b) & -32 ? a[b / 32 | 0] << 32 - d ^ a[b / 32 + 1 | 0] >>> d : a[b / 32 | 0] >>> d) & (1 << c) - 1
    },
    concat: function(a, b) {
        if (0 === a.length || 0 === b.length) return a.concat(b);
        var c = a[a.length - 1],
            d = sjcl.bitArray.getPartial(c);
        return 32 === d ? a.concat(b) : sjcl.bitArray.O(b, d, c | 0, a.slice(0, a.length - 1))
    },
    bitLength: function(a) {
        var b = a.length;
        return 0 ===
            b ? 0 : 32 * (b - 1) + sjcl.bitArray.getPartial(a[b - 1])
    },
    clamp: function(a, b) {
        if (32 * a.length < b) return a;
        a = a.slice(0, Math.ceil(b / 32));
        var c = a.length;
        b &= 31;
        0 < c && b && (a[c - 1] = sjcl.bitArray.partial(b, a[c - 1] & 2147483648 >> b - 1, 1));
        return a
    },
    partial: function(a, b, c) {
        return 32 === a ? b : (c ? b | 0 : b << 32 - a) + 0x10000000000 * a
    },
    getPartial: function(a) {
        return Math.round(a / 0x10000000000) || 32
    },
    equal: function(a, b) {
        if (sjcl.bitArray.bitLength(a) !== sjcl.bitArray.bitLength(b)) return s;
        var c = 0,
            d;
        for (d = 0; d < a.length; d++) c |= a[d] ^ b[d];
        return 0 ===
            c
    },
    O: function(a, b, c, d) {
        var e;
        e = 0;
        for (d === r && (d = []); 32 <= b; b -= 32) d.push(c), c = 0;
        if (0 === b) return d.concat(a);
        for (e = 0; e < a.length; e++) d.push(c | a[e] >>> b), c = a[e] << 32 - b;
        e = a.length ? a[a.length - 1] : 0;
        a = sjcl.bitArray.getPartial(e);
        d.push(sjcl.bitArray.partial(b + a & 31, 32 < b + a ? c : d.pop(), 1));
        return d
    },
    s: function(a, b) {
        return [a[0] ^ b[0], a[1] ^ b[1], a[2] ^ b[2], a[3] ^ b[3]]
    }
};
sjcl.codec.utf8String = {
    fromBits: function(a) {
        var b = "",
            c = sjcl.bitArray.bitLength(a),
            d, e;
        for (d = 0; d < c / 8; d++) 0 === (d & 3) && (e = a[d / 4]), b += String.fromCharCode(e >>> 24), e <<= 8;
        return decodeURIComponent(escape(b))
    },
    toBits: function(a) {
        a = unescape(encodeURIComponent(a));
        var b = [],
            c, d = 0;
        for (c = 0; c < a.length; c++) d = d << 8 | a.charCodeAt(c), 3 === (c & 3) && (b.push(d), d = 0);
        c & 3 && b.push(sjcl.bitArray.partial(8 * (c & 3), d));
        return b
    }
};
sjcl.codec.hex = {
    fromBits: function(a) {
        var b = "",
            c;
        for (c = 0; c < a.length; c++) b += ((a[c] | 0) + 0xf00000000000).toString(16).substr(4);
        return b.substr(0, sjcl.bitArray.bitLength(a) / 4)
    },
    toBits: function(a) {
        var b, c = [],
            d;
        a = a.replace(/\s|0x/g, "");
        d = a.length;
        a += "00000000";
        for (b = 0; b < a.length; b += 8) c.push(parseInt(a.substr(b, 8), 16) ^ 0);
        return sjcl.bitArray.clamp(c, 4 * d)
    }
};
sjcl.codec.base64 = {
    I: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
    fromBits: function(a, b, c) {
        var d = "",
            e = 0,
            f = sjcl.codec.base64.I,
            g = 0,
            h = sjcl.bitArray.bitLength(a);
        c && (f = f.substr(0, 62) + "-_");
        for (c = 0; 6 * d.length < h;) d += f.charAt((g ^ a[c] >>> e) >>> 26), 6 > e ? (g = a[c] << 6 - e, e += 26, c++) : (g <<= 6, e -= 6);
        for (; d.length & 3 && !b;) d += "=";
        return d
    },
    toBits: function(a, b) {
        a = a.replace(/\s|=/g, "");
        var c = [],
            d, e = 0,
            f = sjcl.codec.base64.I,
            g = 0,
            h;
        b && (f = f.substr(0, 62) + "-_");
        for (d = 0; d < a.length; d++) h = f.indexOf(a.charAt(d)),
            0 > h && l(new sjcl.exception.invalid("this isn't base64!")), 26 < e ? (e -= 26, c.push(g ^ h >>> e), g = h << 32 - e) : (e += 6, g ^= h << 32 - e);
        e & 56 && c.push(sjcl.bitArray.partial(e & 56, g, 1));
        return c
    }
};
sjcl.codec.base64url = {
    fromBits: function(a) {
        return sjcl.codec.base64.fromBits(a, 1, 1)
    },
    toBits: function(a) {
        return sjcl.codec.base64.toBits(a, 1)
    }
};
sjcl.hash.sha256 = function(a) {
    this.b[0] || this.D();
    a ? (this.e = a.e.slice(0), this.d = a.d.slice(0), this.c = a.c) : this.reset()
};
sjcl.hash.sha256.hash = function(a) {
    return (new sjcl.hash.sha256).update(a).finalize()
};
sjcl.hash.sha256.prototype = {
    blockSize: 512,
    reset: function() {
        this.e = this.q.slice(0);
        this.d = [];
        this.c = 0;
        return this
    },
    update: function(a) {
        "string" === typeof a && (a = sjcl.codec.utf8String.toBits(a));
        var b, c = this.d = sjcl.bitArray.concat(this.d, a);
        b = this.c;
        a = this.c = b + sjcl.bitArray.bitLength(a);
        for (b = 512 + b & -512; b <= a; b += 512) this.o(c.splice(0, 16));
        return this
    },
    finalize: function() {
        var a, b = this.d,
            c = this.e,
            b = sjcl.bitArray.concat(b, [sjcl.bitArray.partial(1, 1)]);
        for (a = b.length + 2; a & 15; a++) b.push(0);
        b.push(Math.floor(this.c /
            4294967296));
        for (b.push(this.c | 0); b.length;) this.o(b.splice(0, 16));
        this.reset();
        return c
    },
    q: [],
    b: [],
    D: function() {
        function a(a) {
            return 0x100000000 * (a - Math.floor(a)) | 0
        }
        var b = 0,
            c = 2,
            d;
        a: for (; 64 > b; c++) {
            for (d = 2; d * d <= c; d++)
                if (0 === c % d) continue a;
            8 > b && (this.q[b] = a(Math.pow(c, 0.5)));
            this.b[b] = a(Math.pow(c, 1 / 3));
            b++
        }
    },
    o: function(a) {
        var b, c, d = a.slice(0),
            e = this.e,
            f = this.b,
            g = e[0],
            h = e[1],
            k = e[2],
            m = e[3],
            p = e[4],
            n = e[5],
            q = e[6],
            t = e[7];
        for (a = 0; 64 > a; a++) 16 > a ? b = d[a] : (b = d[a + 1 & 15], c = d[a + 14 & 15], b = d[a & 15] = (b >>> 7 ^ b >>> 18 ^ b >>> 3 ^
            b << 25 ^ b << 14) + (c >>> 17 ^ c >>> 19 ^ c >>> 10 ^ c << 15 ^ c << 13) + d[a & 15] + d[a + 9 & 15] | 0), b = b + t + (p >>> 6 ^ p >>> 11 ^ p >>> 25 ^ p << 26 ^ p << 21 ^ p << 7) + (q ^ p & (n ^ q)) + f[a], t = q, q = n, n = p, p = m + b | 0, m = k, k = h, h = g, g = b + (h & k ^ m & (h ^ k)) + (h >>> 2 ^ h >>> 13 ^ h >>> 22 ^ h << 30 ^ h << 19 ^ h << 10) | 0;
        e[0] = e[0] + g | 0;
        e[1] = e[1] + h | 0;
        e[2] = e[2] + k | 0;
        e[3] = e[3] + m | 0;
        e[4] = e[4] + p | 0;
        e[5] = e[5] + n | 0;
        e[6] = e[6] + q | 0;
        e[7] = e[7] + t | 0
    }
};
sjcl.hash.sha1 = function(a) {
    a ? (this.e = a.e.slice(0), this.d = a.d.slice(0), this.c = a.c) : this.reset()
};
sjcl.hash.sha1.hash = function(a) {
    return (new sjcl.hash.sha1).update(a).finalize()
};
sjcl.hash.sha1.prototype = {
    blockSize: 512,
    reset: function() {
        this.e = this.q.slice(0);
        this.d = [];
        this.c = 0;
        return this
    },
    update: function(a) {
        "string" === typeof a && (a = sjcl.codec.utf8String.toBits(a));
        var b, c = this.d = sjcl.bitArray.concat(this.d, a);
        b = this.c;
        a = this.c = b + sjcl.bitArray.bitLength(a);
        for (b = this.blockSize + b & -this.blockSize; b <= a; b += this.blockSize) this.o(c.splice(0, 16));
        return this
    },
    finalize: function() {
        var a, b = this.d,
            c = this.e,
            b = sjcl.bitArray.concat(b, [sjcl.bitArray.partial(1, 1)]);
        for (a = b.length + 2; a & 15; a++) b.push(0);
        b.push(Math.floor(this.c / 0x100000000));
        for (b.push(this.c | 0); b.length;) this.o(b.splice(0, 16));
        this.reset();
        return c
    },
    q: [1732584193, 4023233417, 2562383102, 271733878, 3285377520],
    b: [1518500249, 1859775393, 2400959708, 3395469782],
    o: function(a) {
        var b, c, d, e, f, g, h = a.slice(0),
            k = this.e;
        c = k[0];
        d = k[1];
        e = k[2];
        f = k[3];
        g = k[4];
        for (a = 0; 79 >= a; a++) 16 <= a && (h[a] = (h[a - 3] ^ h[a - 8] ^ h[a - 14] ^ h[a - 16]) << 1 | (h[a - 3] ^ h[a - 8] ^ h[a - 14] ^ h[a - 16]) >>> 31), b = 19 >= a ? d & e | ~d & f : 39 >= a ? d ^ e ^ f : 59 >= a ? d & e | d & f | e & f : 79 >= a ? d ^ e ^ f : r, b = (c << 5 | c >>> 27) + b + g + h[a] + this.b[Math.floor(a /
            20)] | 0, g = f, f = e, e = d << 30 | d >>> 2, d = c, c = b;
        k[0] = k[0] + c | 0;
        k[1] = k[1] + d | 0;
        k[2] = k[2] + e | 0;
        k[3] = k[3] + f | 0;
        k[4] = k[4] + g | 0
    }
};
sjcl.mode.ccm = {
    name: "ccm",
    encrypt: function(a, b, c, d, e) {
        var f, g = b.slice(0),
            h = sjcl.bitArray,
            k = h.bitLength(c) / 8,
            m = h.bitLength(g) / 8;
        e = e || 64;
        d = d || [];
        7 > k && l(new sjcl.exception.invalid("ccm: iv must be at least 7 bytes"));
        for (f = 2; 4 > f && m >>> 8 * f; f++);
        f < 15 - k && (f = 15 - k);
        c = h.clamp(c, 8 * (15 - f));
        b = sjcl.mode.ccm.K(a, b, c, d, e, f);
        g = sjcl.mode.ccm.L(a, g, c, b, e, f);
        return h.concat(g.data, g.tag)
    },
    decrypt: function(a, b, c, d, e) {
        e = e || 64;
        d = d || [];
        var f = sjcl.bitArray,
            g = f.bitLength(c) / 8,
            h = f.bitLength(b),
            k = f.clamp(b, h - e),
            m = f.bitSlice(b,
                h - e),
            h = (h - e) / 8;
        7 > g && l(new sjcl.exception.invalid("ccm: iv must be at least 7 bytes"));
        for (b = 2; 4 > b && h >>> 8 * b; b++);
        b < 15 - g && (b = 15 - g);
        c = f.clamp(c, 8 * (15 - b));
        k = sjcl.mode.ccm.L(a, k, c, m, e, b);
        a = sjcl.mode.ccm.K(a, k.data, c, d, e, b);
        f.equal(k.tag, a) || l(new sjcl.exception.corrupt("ccm: tag doesn't match"));
        return k.data
    },
    K: function(a, b, c, d, e, f) {
        var g = [],
            h = sjcl.bitArray,
            k = h.s;
        e /= 8;
        (e % 2 || 4 > e || 16 < e) && l(new sjcl.exception.invalid("ccm: invalid tag length"));
        (0xffffffff < d.length || 0xffffffff < b.length) && l(new sjcl.exception.bug("ccm: can't deal with 4GiB or more data"));
        f = [h.partial(8, (d.length ? 64 : 0) | e - 2 << 2 | f - 1)];
        f = h.concat(f, c);
        f[3] |= h.bitLength(b) / 8;
        f = a.encrypt(f);
        if (d.length) {
            c = h.bitLength(d) / 8;
            65279 >= c ? g = [h.partial(16, c)] : 0xffffffff >= c && (g = h.concat([h.partial(16, 65534)], [c]));
            g = h.concat(g, d);
            for (d = 0; d < g.length; d += 4) f = a.encrypt(k(f, g.slice(d, d + 4).concat([0, 0, 0])))
        }
        for (d = 0; d < b.length; d += 4) f = a.encrypt(k(f, b.slice(d, d + 4).concat([0, 0, 0])));
        return h.clamp(f, 8 * e)
    },
    L: function(a, b, c, d, e, f) {
        var g, h = sjcl.bitArray;
        g = h.s;
        var k = b.length,
            m = h.bitLength(b);
        c = h.concat([h.partial(8,
            f - 1)], c).concat([0, 0, 0]).slice(0, 4);
        d = h.bitSlice(g(d, a.encrypt(c)), 0, e);
        if (!k) return {
            tag: d,
            data: []
        };
        for (g = 0; g < k; g += 4) c[3]++, e = a.encrypt(c), b[g] ^= e[0], b[g + 1] ^= e[1], b[g + 2] ^= e[2], b[g + 3] ^= e[3];
        return {
            tag: d,
            data: h.clamp(b, m)
        }
    }
};
sjcl.beware === r && (sjcl.beware = {});
sjcl.beware["CBC mode is dangerous because it doesn't protect message integrity."] = function() {
    sjcl.mode.cbc = {
        name: "cbc",
        encrypt: function(a, b, c, d) {
            d && d.length && l(new sjcl.exception.invalid("cbc can't authenticate data"));
            128 !== sjcl.bitArray.bitLength(c) && l(new sjcl.exception.invalid("cbc iv must be 128 bits"));
            var e = sjcl.bitArray,
                f = e.s,
                g = e.bitLength(b),
                h = 0,
                k = [];
            g & 7 && l(new sjcl.exception.invalid("pkcs#5 padding only works for multiples of a byte"));
            for (d = 0; h + 128 <= g; d += 4, h += 128) c = a.encrypt(f(c, b.slice(d,
                d + 4))), k.splice(d, 0, c[0], c[1], c[2], c[3]);
            g = 0x1010101 * (16 - (g >> 3 & 15));
            c = a.encrypt(f(c, e.concat(b, [g, g, g, g]).slice(d, d + 4)));
            k.splice(d, 0, c[0], c[1], c[2], c[3]);
            return k
        },
        decrypt: function(a, b, c, d) {
            d && d.length && l(new sjcl.exception.invalid("cbc can't authenticate data"));
            128 !== sjcl.bitArray.bitLength(c) && l(new sjcl.exception.invalid("cbc iv must be 128 bits"));
            (sjcl.bitArray.bitLength(b) & 127 || !b.length) && l(new sjcl.exception.corrupt("cbc ciphertext must be a positive multiple of the block size"));
            var e = sjcl.bitArray,
                f = e.s,
                g, h = [];
            for (d = 0; d < b.length; d += 4) g = b.slice(d, d + 4), c = f(c, a.decrypt(g)), h.splice(d, 0, c[0], c[1], c[2], c[3]), c = g;
            g = h[d - 1] & 255;
            (0 === g || 16 < g) && l(new sjcl.exception.corrupt("pkcs#5 padding corrupt"));
            c = 0x1010101 * g;
            e.equal(e.bitSlice([c, c, c, c], 0, 8 * g), e.bitSlice(h, 32 * h.length - 8 * g, 32 * h.length)) || l(new sjcl.exception.corrupt("pkcs#5 padding corrupt"));
            return e.bitSlice(h, 0, 32 * h.length - 8 * g)
        }
    }
};
sjcl.misc.hmac = function(a, b) {
    this.M = b = b || sjcl.hash.sha256;
    var c = [
            [],
            []
        ],
        d, e = b.prototype.blockSize / 32;
    this.n = [new b, new b];
    a.length > e && (a = b.hash(a));
    for (d = 0; d < e; d++) c[0][d] = a[d] ^ 909522486, c[1][d] = a[d] ^ 1549556828;
    this.n[0].update(c[0]);
    this.n[1].update(c[1]);
    this.G = new b(this.n[0])
};
sjcl.misc.hmac.prototype.encrypt = sjcl.misc.hmac.prototype.mac = function(a) {
    this.P && l(new sjcl.exception.invalid("encrypt on already updated hmac called!"));
    this.update(a);
    return this.digest(a)
};
sjcl.misc.hmac.prototype.reset = function() {
    this.G = new this.M(this.n[0]);
    this.P = s
};
sjcl.misc.hmac.prototype.update = function(a) {
    this.P = !0;
    this.G.update(a)
};
sjcl.misc.hmac.prototype.digest = function() {
    var a = this.G.finalize(),
        a = (new this.M(this.n[1])).update(a).finalize();
    this.reset();
    return a
};
sjcl.misc.pbkdf2 = function(a, b, c, d, e) {
    c = c || 1E3;
    (0 > d || 0 > c) && l(sjcl.exception.invalid("invalid params to pbkdf2"));
    "string" === typeof a && (a = sjcl.codec.utf8String.toBits(a));
    "string" === typeof b && (b = sjcl.codec.utf8String.toBits(b));
    e = e || sjcl.misc.hmac;
    a = new e(a);
    var f, g, h, k, m = [],
        p = sjcl.bitArray;
    for (k = 1; 32 * m.length < (d || 1); k++) {
        e = f = a.encrypt(p.concat(b, [k]));
        for (g = 1; g < c; g++) {
            f = a.encrypt(f);
            for (h = 0; h < f.length; h++) e[h] ^= f[h]
        }
        m = m.concat(e)
    }
    d && (m = p.clamp(m, d));
    return m
};
sjcl.prng = function(a) {
    this.f = [new sjcl.hash.sha256];
    this.j = [0];
    this.F = 0;
    this.r = {};
    this.C = 0;
    this.J = {};
    this.N = this.g = this.k = this.V = 0;
    this.b = [0, 0, 0, 0, 0, 0, 0, 0];
    this.i = [0, 0, 0, 0];
    this.A = r;
    this.B = a;
    this.p = s;
    this.w = {
        progress: {},
        seeded: {}
    };
    this.m = this.U = 0;
    this.t = 1;
    this.u = 2;
    this.R = 0x10000;
    this.H = [0, 48, 64, 96, 128, 192, 0x100, 384, 512, 768, 1024];
    this.S = 3E4;
    this.Q = 80
};
sjcl.prng.prototype = {
    randomWords: function(a, b) {
        var c = [],
            d;
        d = this.isReady(b);
        var e;
        d === this.m && l(new sjcl.exception.notReady("generator isn't seeded"));
        if (d & this.u) {
            d = !(d & this.t);
            e = [];
            var f = 0,
                g;
            this.N = e[0] = (new Date).valueOf() + this.S;
            for (g = 0; 16 > g; g++) e.push(0x100000000 * Math.random() | 0);
            for (g = 0; g < this.f.length && !(e = e.concat(this.f[g].finalize()), f += this.j[g], this.j[g] = 0, !d && this.F & 1 << g); g++);
            this.F >= 1 << this.f.length && (this.f.push(new sjcl.hash.sha256), this.j.push(0));
            this.g -= f;
            f > this.k && (this.k = f);
            this.F++;
            this.b = sjcl.hash.sha256.hash(this.b.concat(e));
            this.A = new sjcl.cipher.aes(this.b);
            for (d = 0; 4 > d && !(this.i[d] = this.i[d] + 1 | 0, this.i[d]); d++);
        }
        for (d = 0; d < a; d += 4) 0 === (d + 1) % this.R && z(this), e = A(this), c.push(e[0], e[1], e[2], e[3]);
        z(this);
        return c.slice(0, a)
    },
    setDefaultParanoia: function(a, b) {
        0 === a && "Setting paranoia=0 will ruin your security; use it only for testing" !== b && l("Setting paranoia=0 will ruin your security; use it only for testing");
        this.B = a
    },
    addEntropy: function(a, b, c) {
        c = c || "user";
        var d, e, f = (new Date).valueOf(),
            g = this.r[c],
            h = this.isReady(),
            k = 0;
        d = this.J[c];
        d === r && (d = this.J[c] = this.V++);
        g === r && (g = this.r[c] = 0);
        this.r[c] = (this.r[c] + 1) % this.f.length;
        switch (typeof a) {
            case "number":
                b === r && (b = 1);
                this.f[g].update([d, this.C++, 1, b, f, 1, a | 0]);
                break;
            case "object":
                c = Object.prototype.toString.call(a);
                if ("[object Uint32Array]" === c) {
                    e = [];
                    for (c = 0; c < a.length; c++) e.push(a[c]);
                    a = e
                } else {
                    "[object Array]" !== c && (k = 1);
                    for (c = 0; c < a.length && !k; c++) "number" !== typeof a[c] && (k = 1)
                }
                if (!k) {
                    if (b === r)
                        for (c = b = 0; c < a.length; c++)
                            for (e = a[c]; 0 < e;) b++,
                                e >>>= 1;
                    this.f[g].update([d, this.C++, 2, b, f, a.length].concat(a))
                }
                break;
            case "string":
                b === r && (b = a.length);
                this.f[g].update([d, this.C++, 3, b, f, a.length]);
                this.f[g].update(a);
                break;
            default:
                k = 1
        }
        k && l(new sjcl.exception.bug("random: addEntropy only supports number, array of numbers or string"));
        this.j[g] += b;
        this.g += b;
        h === this.m && (this.isReady() !== this.m && B("seeded", Math.max(this.k, this.g)), B("progress", this.getProgress()))
    },
    isReady: function(a) {
        a = this.H[a !== r ? a : this.B];
        return this.k && this.k >= a ? this.j[0] > this.Q &&
            (new Date).valueOf() > this.N ? this.u | this.t : this.t : this.g >= a ? this.u | this.m : this.m
    },
    getProgress: function(a) {
        a = this.H[a ? a : this.B];
        return this.k >= a ? 1 : this.g > a ? 1 : this.g / a
    },
    startCollectors: function() {
        this.p || (this.a = {
            loadTimeCollector: C(this, this.Z),
            mouseCollector: C(this, this.$),
            keyboardCollector: C(this, this.Y),
            accelerometerCollector: C(this, this.T)
        }, window.addEventListener ? (window.addEventListener("load", this.a.loadTimeCollector, s), window.addEventListener("mousemove", this.a.mouseCollector, s), window.addEventListener("keypress",
            this.a.keyboardCollector, s), window.addEventListener("devicemotion", this.a.accelerometerCollector, s)) : document.attachEvent ? (document.attachEvent("onload", this.a.loadTimeCollector), document.attachEvent("onmousemove", this.a.mouseCollector), document.attachEvent("keypress", this.a.keyboardCollector)) : l(new sjcl.exception.bug("can't attach event")), this.p = !0)
    },
    stopCollectors: function() {
        this.p && (window.removeEventListener ? (window.removeEventListener("load", this.a.loadTimeCollector, s), window.removeEventListener("mousemove",
            this.a.mouseCollector, s), window.removeEventListener("keypress", this.a.keyboardCollector, s), window.removeEventListener("devicemotion", this.a.accelerometerCollector, s)) : document.detachEvent && (document.detachEvent("onload", this.a.loadTimeCollector), document.detachEvent("onmousemove", this.a.mouseCollector), document.detachEvent("keypress", this.a.keyboardCollector)), this.p = s)
    },
    addEventListener: function(a, b) {
        this.w[a][this.U++] = b
    },
    removeEventListener: function(a, b) {
        var c, d, e = this.w[a],
            f = [];
        for (d in e) e.hasOwnProperty(d) &&
            e[d] === b && f.push(d);
        for (c = 0; c < f.length; c++) d = f[c], delete e[d]
    },
    Y: function() {
        D(1)
    },
    $: function(a) {
        sjcl.random.addEntropy([a.x || a.clientX || a.offsetX || 0, a.y || a.clientY || a.offsetY || 0], 2, "mouse");
        D(0)
    },
    Z: function() {
        D(2)
    },
    T: function(a) {
        a = a.accelerationIncludingGravity.x || a.accelerationIncludingGravity.y || a.accelerationIncludingGravity.z;
        var b = "";
        window.orientation && (b = window.orientation);
        sjcl.random.addEntropy([a, b], 3, "accelerometer");
        D(0)
    }
};

function B(a, b) {
    var c, d = sjcl.random.w[a],
        e = [];
    for (c in d) d.hasOwnProperty(c) && e.push(d[c]);
    for (c = 0; c < e.length; c++) e[c](b)
}

function D(a) {
    window && window.performance && "function" === typeof window.performance.now ? sjcl.random.addEntropy(window.performance.now(), a, "loadtime") : sjcl.random.addEntropy((new Date).valueOf(), a, "loadtime")
}

function z(a) {
    a.b = A(a).concat(A(a));
    a.A = new sjcl.cipher.aes(a.b)
}

function A(a) {
    for (var b = 0; 4 > b && !(a.i[b] = a.i[b] + 1 | 0, a.i[b]); b++);
    return a.A.encrypt(a.i)
}

function C(a, b) {
    return function() {
        b.apply(a, arguments)
    }
}
sjcl.random = new sjcl.prng(6);
a: try {
    var E, F, G;
    if ("undefined" !== typeof module && module.exports) F = require("crypto"), E = F.randomBytes(128), sjcl.random.addEntropy(E, 1024, "crypto['randomBytes']");
    else if (window && Uint32Array) {
        G = new Uint32Array(32);
        if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(G);
        else if (window.msCrypto && window.msCrypto.getRandomValues) window.msCrypto.getRandomValues(G);
        else break a;
        sjcl.random.addEntropy(G, 1024, "crypto['getRandomValues']")
    }
} catch (H) {
    console.log("There was an error collecting entropy from the browser:"),
        console.log(H)
}
sjcl.json = {
    defaults: {
        v: 1,
        iter: 1E3,
        ks: 128,
        ts: 64,
        mode: "ccm",
        adata: "",
        cipher: "aes"
    },
    X: function(a, b, c, d) {
        c = c || {};
        d = d || {};
        var e = sjcl.json,
            f = e.h({
                iv: sjcl.random.randomWords(4, 0)
            }, e.defaults),
            g;
        e.h(f, c);
        c = f.adata;
        "string" === typeof f.salt && (f.salt = sjcl.codec.base64.toBits(f.salt));
        "string" === typeof f.iv && (f.iv = sjcl.codec.base64.toBits(f.iv));
        (!sjcl.mode[f.mode] || !sjcl.cipher[f.cipher] || "string" === typeof a && 100 >= f.iter || 64 !== f.ts && 96 !== f.ts && 128 !== f.ts || 128 !== f.ks && 192 !== f.ks && 0x100 !== f.ks || 2 > f.iv.length || 4 <
            f.iv.length) && l(new sjcl.exception.invalid("json encrypt: invalid parameters"));
        "string" === typeof a ? (g = sjcl.misc.cachedPbkdf2(a, f), a = g.key.slice(0, f.ks / 32), f.salt = g.salt) : sjcl.ecc && a instanceof sjcl.ecc.elGamal.publicKey && (g = a.kem(), f.kemtag = g.tag, a = g.key.slice(0, f.ks / 32));
        "string" === typeof b && (b = sjcl.codec.utf8String.toBits(b));
        "string" === typeof c && (c = sjcl.codec.utf8String.toBits(c));
        g = new sjcl.cipher[f.cipher](a);
        e.h(d, f);
        d.key = a;
        f.ct = sjcl.mode[f.mode].encrypt(g, b, f.iv, c, f.ts);
        return f
    },
    encrypt: function(a,
        b, c, d) {
        var e = sjcl.json,
            f = e.X.apply(e, arguments);
        return e.encode(f)
    },
    W: function(a, b, c, d) {
        c = c || {};
        d = d || {};
        var e = sjcl.json;
        b = e.h(e.h(e.h({}, e.defaults), b), c, !0);
        var f;
        c = b.adata;
        "string" === typeof b.salt && (b.salt = sjcl.codec.base64.toBits(b.salt));
        "string" === typeof b.iv && (b.iv = sjcl.codec.base64.toBits(b.iv));
        (!sjcl.mode[b.mode] || !sjcl.cipher[b.cipher] || "string" === typeof a && 100 >= b.iter || 64 !== b.ts && 96 !== b.ts && 128 !== b.ts || 128 !== b.ks && 192 !== b.ks && 0x100 !== b.ks || !b.iv || 2 > b.iv.length || 4 < b.iv.length) && l(new sjcl.exception.invalid("json decrypt: invalid parameters"));
        "string" === typeof a ? (f = sjcl.misc.cachedPbkdf2(a, b), a = f.key.slice(0, b.ks / 32), b.salt = f.salt) : sjcl.ecc && a instanceof sjcl.ecc.elGamal.secretKey && (a = a.unkem(sjcl.codec.base64.toBits(b.kemtag)).slice(0, b.ks / 32));
        "string" === typeof c && (c = sjcl.codec.utf8String.toBits(c));
        f = new sjcl.cipher[b.cipher](a);
        c = sjcl.mode[b.mode].decrypt(f, b.ct, b.iv, c, b.ts);
        e.h(d, b);
        d.key = a;
        return sjcl.codec.utf8String.fromBits(c)
    },
    decrypt: function(a, b, c, d) {
        var e = sjcl.json;
        return e.W(a, e.decode(b), c, d)
    },
    encode: function(a) {
        var b, c =
            "{",
            d = "";
        for (b in a)
            if (a.hasOwnProperty(b)) switch (b.match(/^[a-z0-9]+$/i) || l(new sjcl.exception.invalid("json encode: invalid property name")), c += d + '"' + b + '":', d = ",", typeof a[b]) {
                case "number":
                case "boolean":
                    c += a[b];
                    break;
                case "string":
                    c += '"' + escape(a[b]) + '"';
                    break;
                case "object":
                    c += '"' + sjcl.codec.base64.fromBits(a[b], 0) + '"';
                    break;
                default:
                    l(new sjcl.exception.bug("json encode: unsupported type"))
            }
            return c + "}"
    },
    decode: function(a) {
        a = a.replace(/\s/g, "");
        a.match(/^\{.*\}$/) || l(new sjcl.exception.invalid("json decode: this isn't json!"));
        a = a.replace(/^\{|\}$/g, "").split(/,/);
        var b = {},
            c, d;
        for (c = 0; c < a.length; c++)(d = a[c].match(/^(?:(["']?)([a-z][a-z0-9]*)\1):(?:(\d+)|"([a-z0-9+\/%*_.@=\-]*)")$/i)) || l(new sjcl.exception.invalid("json decode: this isn't json!")), b[d[2]] = d[3] ? parseInt(d[3], 10) : d[2].match(/^(ct|salt|iv)$/) ? sjcl.codec.base64.toBits(d[4]) : unescape(d[4]);
        return b
    },
    h: function(a, b, c) {
        a === r && (a = {});
        if (b === r) return a;
        for (var d in b) b.hasOwnProperty(d) && (c && (a[d] !== r && a[d] !== b[d]) && l(new sjcl.exception.invalid("required parameter overridden")),
            a[d] = b[d]);
        return a
    },
    ca: function(a, b) {
        var c = {},
            d;
        for (d in a) a.hasOwnProperty(d) && a[d] !== b[d] && (c[d] = a[d]);
        return c
    },
    ba: function(a, b) {
        var c = {},
            d;
        for (d = 0; d < b.length; d++) a[b[d]] !== r && (c[b[d]] = a[b[d]]);
        return c
    }
};
sjcl.encrypt = sjcl.json.encrypt;
sjcl.decrypt = sjcl.json.decrypt;
sjcl.misc.aa = {};
sjcl.misc.cachedPbkdf2 = function(a, b) {
    var c = sjcl.misc.aa,
        d;
    b = b || {};
    d = b.iter || 1E3;
    c = c[a] = c[a] || {};
    d = c[d] = c[d] || {
        firstSalt: b.salt && b.salt.length ? b.salt.slice(0) : sjcl.random.randomWords(2, 0)
    };
    c = b.salt === r ? d.firstSalt : b.salt;
    d[c] = d[c] || sjcl.misc.pbkdf2(a, c, b.iter);
    return {
        key: d[c].slice(0),
        salt: c.slice(0)
    }
};
exports.sjcl = sjcl; 
