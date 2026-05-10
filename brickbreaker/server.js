const port = Number(process.env.PORT || 5180);

const mimeTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript"
};

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file(`.${pathname}`);

    if (!(await file.exists())) {
      return new Response("Not found", { status: 404 });
    }

    const extension = pathname.slice(pathname.lastIndexOf("."));
    return new Response(file, {
      headers: {
        "Content-Type": mimeTypes[extension] || "application/octet-stream"
      }
    });
  }
});

console.log(`Brickbreaker running at http://127.0.0.1:${port}`);
