# NEXO 5.0 — Plataforma de gestión de atención

MVP frontend en React + Vite para demostrar el flujo de atención de un restaurante.

## Requisitos
- Node.js LTS
- npm

## Instalación
```bash
npm install
npm run dev
```
Abre la dirección local que indique Vite (normalmente http://localhost:5173).

## Vista de administración
Abre la URL principal.

## Vista de cliente por QR
Puedes probar la experiencia de cliente con:
- `http://localhost:5173/?mesa=1`
- `http://localhost:5173/?mesa=2`
- `http://localhost:5173/?mesa=3`

Desde el panel, en Gestión de mesas, selecciona una mesa y copia su enlace de cliente.

## Funcionalidades incluidas
- Dashboard y métricas locales
- Bandeja de solicitudes con filtros y búsqueda
- Cambiar solicitudes entre pendiente, en proceso y atendida
- Gestión de mesas y zonas
- Enlaces de acceso por mesa para probar el flujo QR
- Gestión básica de equipo
- Reportes y exportación CSV
- Configuración básica
- Persistencia local con localStorage
- Diseño responsive

## Limitaciones importantes de esta versión
Esta versión es una demostración frontend. Los datos se guardan en el navegador mediante localStorage. Para operar con restaurantes reales se debe implementar:
1. Backend/API y base de datos compartida.
2. Autenticación y roles reales.
3. Sincronización en tiempo real entre el teléfono del cliente y el panel.
4. Generación y descarga de imágenes QR reales.
5. Hosting, dominio, HTTPS, monitoreo y copias de seguridad.
6. Protección de datos, validación y controles de seguridad.

No usar datos de clientes reales ni presentar esta demo como servicio productivo hasta implementar y probar esos componentes.
