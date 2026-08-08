CREATE TABLE "circuits" (
	"id" serial PRIMARY KEY NOT NULL,
	"district_id" integer NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "districts" (
	"id" serial PRIMARY KEY NOT NULL,
	"province_id" integer NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provinces" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "provinces_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "circuit_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "activation_code" text NOT NULL;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "activated_at" timestamp;--> statement-breakpoint
ALTER TABLE "circuits" ADD CONSTRAINT "circuits_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "districts" ADD CONSTRAINT "districts_province_id_provinces_id_fk" FOREIGN KEY ("province_id") REFERENCES "public"."provinces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schools" ADD CONSTRAINT "schools_circuit_id_circuits_id_fk" FOREIGN KEY ("circuit_id") REFERENCES "public"."circuits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schools" ADD CONSTRAINT "schools_activation_code_unique" UNIQUE("activation_code");