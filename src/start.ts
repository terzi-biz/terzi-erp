import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    // Прострочена/відсутня сесія — це 401, а не аварія сервера:
    // інакше клієнт отримує HTML-сторінку помилки замість зрозумілої відповіді.
    if (message.startsWith("Unauthorized")) {
      return new Response(JSON.stringify({ error: message }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

/** Помилки серверних функцій повертаємо як JSON (401 для сесії), а не як HTML-сторінку. */
const serverFnErrorMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error instanceof Response) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("Unauthorized")) {
      throw new Response(JSON.stringify({ error: message }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    throw error;
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [serverFnErrorMiddleware, attachSupabaseAuth],
  requestMiddleware: [errorMiddleware],
}));

