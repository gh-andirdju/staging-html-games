const port = Number(process.env.PORT || 5200);
const rawBasePath = process.env.BASE_PATH || "/";
const normalizedBasePath = rawBasePath === "/"
  ? "/"
  : `/${rawBasePath.replace(/^\/+|\/+$/g, "")}/`;

const mimeTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript"
};

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    if (normalizedBasePath !== "/") {
      if (url.pathname === normalizedBasePath.slice(0, -1)) {
        return Response.redirect(`${normalizedBasePath}`, 308);
      }

      if (!url.pathname.startsWith(normalizedBasePath)) {
        return new Response("Not found", { status: 404 });
      }
    }

    const requestPath = normalizedBasePath === "/"
      ? url.pathname
      : `/${url.pathname.slice(normalizedBasePath.length)}`;
    const pathname = requestPath === "/" ? "/index.html" : requestPath;
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

console.log(`Asteroids running at http://127.0.0.1:${port}${normalizedBasePath}`);
