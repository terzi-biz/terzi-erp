import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    // Готову відповідь (401/redirect тощо) віддаємо як є — інакше фреймворк
    // не бачить результату і повертає загальну 500 без тексту помилки.
    if (error instanceof Response) throw error;
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    // Прострочена/відсутня сесія — це 401, а не аварія сервера.
    if (message.startsWith("Unauthorized")) {
      throw new Response(JSON.stringify({ error: message }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    console.error(error);
    throw new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

/** Помилки серверних функцій: на сервері — коректний HTTP-статус (401 для сесії),
 *  на клієнті — звичайна помилка з текстом, а не «[object Response]». */
const serverFnErrorMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      if (error instanceof Response) {
        let message = `Помилка запиту (${error.status})`;
        try {
          const body = await error.clone().json();
          if (body?.error) message = String(body.error);
        } catch {
          /* тіло не JSON — залишаємо загальний текст */
        }
        throw new Error(message);
      }
      throw error;
    }
  })
  .server(async ({ next }) => {
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

