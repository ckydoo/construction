FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV STORAGE_DRIVER="supabase"
ENV SUPABASE_STORAGE_BUCKET="buildops-documents"
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/src ./src
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.mjs ./next.config.mjs
COPY --from=build /app/postcss.config.mjs ./postcss.config.mjs
COPY --from=build /app/tailwind.config.ts ./tailwind.config.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s CMD wget -qO- http://127.0.0.1:3000/login >/dev/null || exit 1
CMD ["npm","run","start:prod"]
