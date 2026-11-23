import { NextRequest, NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

const DEFAULT_DEVELOPMENT_BACKEND_API_URL = "http://localhost:4000";

// Solo lo que usan las páginas /auth/* de la web. El resto de la API (login,
// registro…) no se expone por aquí: el proxy no debe servir para saltarse los
// límites por IP de la API usando las IP de Vercel.
const ALLOWED_PATHS = new Set([
  "verify-email",
  "verify-email/validate",
  "reset-password",
  "reset-password/validate",
]);

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyAuthRequest(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyAuthRequest(request, context);
}

async function proxyAuthRequest(request: NextRequest, context: RouteContext) {
  try {
    const { path } = await context.params;
    if (request.method !== "POST" || !ALLOWED_PATHS.has(path.join("/"))) {
      return NextResponse.json({ message: "Not Found" }, { status: 404 });
    }
    const backendUrl = resolveBackendUrl();
    const targetUrl = new URL(`/auth/${path.join("/")}`, backendUrl);
    targetUrl.search = request.nextUrl.search;

    const headers = new Headers();
    forwardHeader(request, headers, "accept");
    forwardHeader(request, headers, "authorization");
    forwardHeader(request, headers, "content-type");

    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: await request.text(),
      cache: "no-store",
    });

    const responseBody = await response.text();
    const responseHeaders = new Headers();
    const responseContentType = response.headers.get("content-type");

    if (responseContentType) {
      responseHeaders.set("content-type", responseContentType);
    }

    return new NextResponse(responseBody, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      {
        message:
          "No fue posible conectar con el servidor de MedicAI. Intenta nuevamente en unos minutos.",
      },
      { status: 502 },
    );
  }
}

function forwardHeader(request: NextRequest, headers: Headers, headerName: string) {
  const value = request.headers.get(headerName);

  if (value) {
    headers.set(headerName, value);
  }
}

function resolveBackendUrl() {
  const configuredBackendUrl = process.env.BACKEND_API_URL ?? process.env.BACKEND_PROXY_URL;

  if (configuredBackendUrl) {
    return configuredBackendUrl.replace(/\/$/, "");
  }

  if (process.env.NODE_ENV !== "production") {
    return DEFAULT_DEVELOPMENT_BACKEND_API_URL;
  }

  throw new Error("BACKEND_API_URL is required in production.");
}
