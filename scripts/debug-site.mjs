import http from "node:http";
import { readFile } from "node:fs/promises";
const html = await readFile(new URL("./fixtures/focus-test.html", import.meta.url));
http
  .createServer((_request, response) => {
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });
    response.end(html);
  })
  .listen(4173, "127.0.0.1", () => console.log("Hourleaf test site: http://localhost:4173"));
