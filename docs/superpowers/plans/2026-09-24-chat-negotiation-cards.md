# Ofertas y visitas como tarjetas del chat — plan

> Ejecutado en la misma sesión que aprobó el diseño. Spec: [2026-09-24-chat-negotiation-cards-design.md](../specs/2026-09-24-chat-negotiation-cards-design.md).

**Goal:** Propuestas y respuestas visibles como tarjetas y avisos dentro del hilo, con acciones en el mismo chat.

**Architecture:** El servidor expone el evento enlazado a cada mensaje; el cliente lo decodifica, lo presenta con funciones puras y cruza su id con la negociación viva para estado y acciones.

**Tech Stack:** PostgreSQL (Supabase), Expo SDK 57, React Native 0.86, `node --test`.

---

### Task 1: Migración y suite SQL
- [x] `supabase/tests/chat_negotiation_cards.sql`: usuarios, vivienda aprobada, conversación, mensaje normal, oferta creada por el comprador y aceptada por el vendedor; aserciones sobre `kh_list_messages`.
- [x] Ejecutarla sin la migración → falla (`negotiation` ausente).
- [x] `supabase/migrations/20260924000100_chat_negotiation_cards.sql` y `scripts/apply-chat-negotiation-cards.mjs` (revierte salvo `--commit`).
- [x] Ejecutar → pasa, inventario intacto.

### Task 2: Tipos y decodificación
- [x] Prueba en `tests/messaging-repository.test.ts`: acepta `negotiation` nulo, ausente y válido; uno ilegible (tipo o acción desconocidos) cae a `null` y el mensaje se ve como texto, sin romper el hilo.
- [x] `MessageNegotiation` en `src/messaging/types.ts` y validación en `decodeChatMessage`.

### Task 3: Presentación
- [x] `tests/negotiation-presentation.test.ts`: títulos (oferta, contraoferta, visita, nueva fecha; propia y ajena), valores, estados, caducidad y textos de aviso.
- [x] `src/negotiations/presentation.ts`.

### Task 4: Componentes
- [x] `ProposalCard.tsx` y `NegotiationNotice.tsx` en `src/components/negotiations/`.

### Task 5: Integración
- [x] `ConversationNegotiations` controlado desde fuera.
- [x] `ConversationScreen`: cabecera con vivienda, botón «+», tarjetas y avisos en `renderItem`, confirmación de «Cancelar acuerdo», errores de mutación en la barra de avisos, refresco al llegar un mensaje enlazado.

### Task 6: Verificación
- [x] `npm run check`.
- [x] Aplicar la migración con permiso del usuario; comprobar el chat en el navegador.
