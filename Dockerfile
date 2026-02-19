FROM node:20-alpine AS builder
WORKDIR /app

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_ENABLE_MOCK_CONNECTORS=false

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_ENABLE_MOCK_CONNECTORS=$VITE_ENABLE_MOCK_CONNECTORS

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY docker/nginx-self-host.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 4173
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=5 CMD wget -q -O - http://127.0.0.1:4173/healthz >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
