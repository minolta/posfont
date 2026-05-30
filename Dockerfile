FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# API origin baked into the production bundle (no trailing slash).
ARG POS_API_BASE_URL=http://203.150.243.87:8080
RUN sed -i "s|useValue: 'http://localhost:8080'|useValue: '${POS_API_BASE_URL}'|g" src/app/app.config.ts

RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist/posfont/browser /usr/share/nginx/html

EXPOSE 80
