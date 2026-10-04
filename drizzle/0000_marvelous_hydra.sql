CREATE SCHEMA "vial";
--> statement-breakpoint
CREATE TABLE "vial"."ajustes" (
	"clave" text PRIMARY KEY NOT NULL,
	"valor" jsonb NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vial"."alertas" (
	"id" serial PRIMARY KEY NOT NULL,
	"zona_id" integer,
	"geocerca_id" integer,
	"titulo" text NOT NULL,
	"detalle" text NOT NULL,
	"nivel" text DEFAULT 'medio' NOT NULL,
	"conteo" smallint DEFAULT 0 NOT NULL,
	"atendida" boolean DEFAULT false NOT NULL,
	"atendida_por" integer,
	"nota" text,
	"creado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vial"."auditoria" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" integer,
	"accion" text NOT NULL,
	"entidad" text NOT NULL,
	"entidad_id" text,
	"detalle" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vial"."camaras" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"url_stream" text,
	"tipo" text DEFAULT 'hls' NOT NULL,
	"descripcion" text,
	"activa" boolean DEFAULT true NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vial"."fuentes" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text DEFAULT 'rss' NOT NULL,
	"url" text,
	"activa" boolean DEFAULT true NOT NULL,
	"ultima_lectura" timestamp with time zone,
	"ultimo_error" text,
	"creado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vial"."geocercas" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"poligono" jsonb NOT NULL,
	"nivel" text DEFAULT 'medio' NOT NULL,
	"color" text DEFAULT '#B45309' NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"legado_id" integer,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geocercas_legado_id_unique" UNIQUE("legado_id")
);
--> statement-breakpoint
CREATE TABLE "vial"."incidente_eventos" (
	"id" serial PRIMARY KEY NOT NULL,
	"incidente_id" integer NOT NULL,
	"tipo" text NOT NULL,
	"texto" text NOT NULL,
	"usuario_id" integer,
	"creado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vial"."incidente_unidades" (
	"incidente_id" integer NOT NULL,
	"unidad_id" integer NOT NULL,
	"asignado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"liberado_en" timestamp with time zone,
	CONSTRAINT "incidente_unidades_incidente_id_unidad_id_asignado_en_pk" PRIMARY KEY("incidente_id","unidad_id","asignado_en")
);
--> statement-breakpoint
CREATE TABLE "vial"."incidentes" (
	"id" serial PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"titulo" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"direccion" text,
	"barrio" text,
	"prioridad" text DEFAULT 'media' NOT NULL,
	"estado" text DEFAULT 'abierto' NOT NULL,
	"sla_min" smallint DEFAULT 20 NOT NULL,
	"siniestro_id" integer,
	"reporte_id" integer,
	"responsable_id" integer,
	"abierto_en" timestamp with time zone DEFAULT now() NOT NULL,
	"despachado_en" timestamp with time zone,
	"en_sitio_en" timestamp with time zone,
	"cerrado_en" timestamp with time zone,
	"cierre" text,
	"simulado" boolean DEFAULT false NOT NULL,
	CONSTRAINT "incidentes_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "vial"."noticias" (
	"id" serial PRIMARY KEY NOT NULL,
	"fuente_id" integer,
	"red" text,
	"titulo" text NOT NULL,
	"url" text NOT NULL,
	"resumen" text,
	"publicado_en" timestamp with time zone NOT NULL,
	"barrio" text,
	"lat" double precision,
	"lng" double precision,
	"gravedad_detectada" text,
	"relevancia" smallint DEFAULT 0 NOT NULL,
	"estado" text DEFAULT 'nueva' NOT NULL,
	"siniestro_id" integer,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "noticias_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "vial"."notificaciones" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" integer,
	"tipo" text DEFAULT 'info' NOT NULL,
	"titulo" text NOT NULL,
	"mensaje" text NOT NULL,
	"enlace" text,
	"leida" boolean DEFAULT false NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vial"."novedades_via" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"titulo" text NOT NULL,
	"descripcion" text,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"desde" timestamp with time zone DEFAULT now() NOT NULL,
	"hasta" timestamp with time zone,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_por" integer,
	"creado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vial"."puntos_negros" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"barrio" text,
	"radio_m" integer DEFAULT 150 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"fatales" integer DEFAULT 0 NOT NULL,
	"graves" integer DEFAULT 0 NOT NULL,
	"indice" double precision DEFAULT 0 NOT NULL,
	"ranking" integer DEFAULT 0 NOT NULL,
	"estado_intervencion" text DEFAULT 'sin_intervenir' NOT NULL,
	"notas" text,
	"calculado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vial"."puntos_qr" (
	"id" serial PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"barrio" text,
	"escaneos" integer DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "puntos_qr_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "vial"."reportes" (
	"id" serial PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"direccion" text,
	"barrio" text,
	"descripcion" text NOT NULL,
	"gravedad_estimada" text DEFAULT 'leve' NOT NULL,
	"hay_heridos" boolean DEFAULT false NOT NULL,
	"vehiculos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"contacto_nombre" text,
	"contacto_telefono" text,
	"canal" text DEFAULT 'web' NOT NULL,
	"punto_qr_id" integer,
	"usuario_id" integer,
	"estado" text DEFAULT 'recibido' NOT NULL,
	"motivo" text,
	"siniestro_id" integer,
	"incidente_id" integer,
	"revisado_por" integer,
	"revisado_en" timestamp with time zone,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reportes_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "vial"."siniestros" (
	"id" serial PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"ocurrido_en" timestamp with time zone NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"barrio" text,
	"direccion" text,
	"gravedad" text NOT NULL,
	"clase" text DEFAULT 'choque' NOT NULL,
	"vehiculos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"heridos" smallint DEFAULT 0 NOT NULL,
	"fallecidos" smallint DEFAULT 0 NOT NULL,
	"clima" text,
	"estado_via" text,
	"iluminacion" text,
	"dia_festivo" boolean DEFAULT false NOT NULL,
	"causa_probable" text,
	"descripcion" text,
	"fuente" text DEFAULT 'manual' NOT NULL,
	"estado" text DEFAULT 'verificado' NOT NULL,
	"registrado_por" integer,
	"legado_id" integer,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "siniestros_codigo_unique" UNIQUE("codigo"),
	CONSTRAINT "siniestros_legado_id_unique" UNIQUE("legado_id")
);
--> statement-breakpoint
CREATE TABLE "vial"."unidades" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text NOT NULL,
	"estado" text DEFAULT 'disponible' NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unidades_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "vial"."usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"usuario" text NOT NULL,
	"email" text NOT NULL,
	"hash_clave" text NOT NULL,
	"rol" text DEFAULT 'ciudadano' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"accesibilidad" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"legado_id" integer,
	"ultimo_ingreso" timestamp with time zone,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_legado_id_unique" UNIQUE("legado_id")
);
--> statement-breakpoint
CREATE TABLE "vial"."zonas_alerta" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"radio_m" integer DEFAULT 500 NOT NULL,
	"umbral" smallint DEFAULT 3 NOT NULL,
	"ventana_min" integer DEFAULT 60 NOT NULL,
	"contacto" text,
	"activa" boolean DEFAULT true NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vial"."alertas" ADD CONSTRAINT "alertas_zona_id_zonas_alerta_id_fk" FOREIGN KEY ("zona_id") REFERENCES "vial"."zonas_alerta"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vial"."alertas" ADD CONSTRAINT "alertas_atendida_por_usuarios_id_fk" FOREIGN KEY ("atendida_por") REFERENCES "vial"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vial"."auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "vial"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vial"."incidente_eventos" ADD CONSTRAINT "incidente_eventos_incidente_id_incidentes_id_fk" FOREIGN KEY ("incidente_id") REFERENCES "vial"."incidentes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vial"."incidente_eventos" ADD CONSTRAINT "incidente_eventos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "vial"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vial"."incidente_unidades" ADD CONSTRAINT "incidente_unidades_incidente_id_incidentes_id_fk" FOREIGN KEY ("incidente_id") REFERENCES "vial"."incidentes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vial"."incidente_unidades" ADD CONSTRAINT "incidente_unidades_unidad_id_unidades_id_fk" FOREIGN KEY ("unidad_id") REFERENCES "vial"."unidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vial"."incidentes" ADD CONSTRAINT "incidentes_siniestro_id_siniestros_id_fk" FOREIGN KEY ("siniestro_id") REFERENCES "vial"."siniestros"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vial"."incidentes" ADD CONSTRAINT "incidentes_reporte_id_reportes_id_fk" FOREIGN KEY ("reporte_id") REFERENCES "vial"."reportes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vial"."incidentes" ADD CONSTRAINT "incidentes_responsable_id_usuarios_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "vial"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vial"."noticias" ADD CONSTRAINT "noticias_fuente_id_fuentes_id_fk" FOREIGN KEY ("fuente_id") REFERENCES "vial"."fuentes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vial"."noticias" ADD CONSTRAINT "noticias_siniestro_id_siniestros_id_fk" FOREIGN KEY ("siniestro_id") REFERENCES "vial"."siniestros"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vial"."notificaciones" ADD CONSTRAINT "notificaciones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "vial"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vial"."novedades_via" ADD CONSTRAINT "novedades_via_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "vial"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vial"."reportes" ADD CONSTRAINT "reportes_punto_qr_id_puntos_qr_id_fk" FOREIGN KEY ("punto_qr_id") REFERENCES "vial"."puntos_qr"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vial"."reportes" ADD CONSTRAINT "reportes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "vial"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vial"."reportes" ADD CONSTRAINT "reportes_siniestro_id_siniestros_id_fk" FOREIGN KEY ("siniestro_id") REFERENCES "vial"."siniestros"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vial"."reportes" ADD CONSTRAINT "reportes_revisado_por_usuarios_id_fk" FOREIGN KEY ("revisado_por") REFERENCES "vial"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vial"."siniestros" ADD CONSTRAINT "siniestros_registrado_por_usuarios_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "vial"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alertas_creado" ON "vial"."alertas" USING btree ("creado");--> statement-breakpoint
CREATE INDEX "auditoria_creado" ON "vial"."auditoria" USING btree ("creado");--> statement-breakpoint
CREATE INDEX "eventos_incidente" ON "vial"."incidente_eventos" USING btree ("incidente_id");--> statement-breakpoint
CREATE INDEX "incidentes_estado" ON "vial"."incidentes" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "incidentes_abierto" ON "vial"."incidentes" USING btree ("abierto_en");--> statement-breakpoint
CREATE INDEX "noticias_publicado" ON "vial"."noticias" USING btree ("publicado_en");--> statement-breakpoint
CREATE INDEX "notificaciones_creado" ON "vial"."notificaciones" USING btree ("creado");--> statement-breakpoint
CREATE INDEX "reportes_creado" ON "vial"."reportes" USING btree ("creado");--> statement-breakpoint
CREATE INDEX "reportes_estado" ON "vial"."reportes" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "siniestros_ocurrido" ON "vial"."siniestros" USING btree ("ocurrido_en");--> statement-breakpoint
CREATE INDEX "siniestros_gravedad" ON "vial"."siniestros" USING btree ("gravedad");--> statement-breakpoint
CREATE INDEX "siniestros_barrio" ON "vial"."siniestros" USING btree ("barrio");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_usuario_unico" ON "vial"."usuarios" USING btree (lower("usuario"));--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_email_unico" ON "vial"."usuarios" USING btree (lower("email"));