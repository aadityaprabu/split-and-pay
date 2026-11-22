const { test } = require("node:test");
const assert = require("node:assert/strict");
const { detectContentType, cleanFileName } = require("./attachments.service");

test("the file type comes from its first bytes", () => {
  assert.equal(detectContentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), "image/jpeg");
  assert.equal(detectContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), "image/png");
  assert.equal(detectContentType(Buffer.from("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
  assert.equal(detectContentType(Buffer.from("%PDF-1.7\n")), "application/pdf");
});

test("anything else is refused, whatever it's called", () => {
  assert.equal(detectContentType(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>")), null);
  assert.equal(detectContentType(Buffer.from("<html><script>alert(1)</script>")), null);
  assert.equal(detectContentType(Buffer.from("RIFF\0\0\0\0WAVEfmt ")), null);
  assert.equal(detectContentType(Buffer.alloc(0)), null);
});

test("file names are decoded and made safe for a header", () => {
  assert.equal(cleanFileName(encodeURIComponent("Bill – March.pdf")), "Bill – March.pdf");
  assert.equal(cleanFileName("..%2F..%2Fetc%2Fpasswd"), ".._.._etc_passwd");
  assert.equal(cleanFileName('a"b\r\nc.jpg'), "abc.jpg");
  assert.equal(cleanFileName("%E0%A4%A"), "%E0%A4%A", "a broken encoding is kept as typed");
  assert.equal(cleanFileName(""), "receipt");
  assert.equal(cleanFileName(undefined), "receipt");
  assert.equal(cleanFileName("x".repeat(300)).length, 200);
});
