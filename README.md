# Frontend Central — Panel Super Admin

SPA React para administración del SaaS: tenants, planes, suscripciones, pagos, empresas SUNAT/PSE, usuarios SA.

## Stack (código actual)

- **Vite 7** · **React 19** · **TypeScript**
- **Tailwind CSS v4** (`@tailwindcss/vite`, sin `tailwind.config.js`)
- **React Router 7**
- **Axios** · **react-hook-form** + **zod 4** · **sonner** · **lucide-react**
- **@tanstack/react-table** · **recharts 3**

## Puerto y proxy

- Dev: **http://localhost:5174**
- Proxy Vite: `/api` → `http://localhost:3000`

## Estructura `src/`

```
contexts/AuthContext.tsx
layouts/MainLayout.tsx
pages/          # dashboard, tenants, plans, subscriptions, payments, users, ...
services/       # api.ts + *Service.ts (sin carpeta api/)
components/ui/  # Card, Modal, Badge, Spinner
components/UbigeoSelects.tsx
utils/tenantUrl.ts
```

## Autenticación

| Clave localStorage | Uso |
|--------------------|-----|
| `sa_token` | JWT Super Admin |
| `sa_user` | Datos usuario |

- Login: `POST /superadmin/login` (base URL incluye `/api`)
- Interceptor en `services/api.ts`: `Authorization: Bearer`
- 401 → limpiar storage y redirect `/login`
- **Sin** header `X-Tenant-Slug`

### Base URL API

`VITE_API_URL` o fallback:

- Dev con proxy: rutas relativas vía `baseURL` con `/api`
- Prod en `app.tukifac.cloud`: `https://api.tukifac.cloud/api`

## Diseño UI

Colores **fijos** (no configurables por tenant):

- Variables CSS `--sa-sidebar-bg`, `--sa-accent`, etc.
- Sidebar slate oscuro, acento blue
- Clase de página: `page-fade`

```tsx
import { Card } from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
```

## Rutas principales

```
/login
/dashboard, /tenants, /empresas-sunat, /empresas-pse
/plans, /subscriptions, /payments, /users, /profile, /settings
```

## Scripts

```bash
npm install
npm run dev      # :5174
npm run build
npm run lint
```

## Variables

```env
VITE_API_URL=http://localhost:3000/api
```

## Convenciones

- Servicios: `import { api } from './api'` — no crear otra instancia Axios
- Tras login: dejar que `useEffect` reaccione a `isAuthenticated` (evitar race con `navigate` inmediato)
- No imponer colores tenant; este panel tiene paleta SA propia

## Relación con otros frontends

No comparte código con `frontend_tenant` ni `restaurant_frontend_tenant`. Duplicación aceptable solo en patrones (AuthContext, Ubigeo) — evaluar paquete compartido si crece.
