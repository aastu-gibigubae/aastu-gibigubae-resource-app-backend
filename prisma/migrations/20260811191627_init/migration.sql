--createEnums
CREATE TYPE "Role" AS ENUM ('student', 'admin');

CREATE TYPE "SubscriptionStatus" AS ENUM ('none', 'active', 'expired');

CREATE TYPE "ActivationStatus" AS ENUM ('pending', 'activated');

CREATE TYPE "ResourceCategory" AS ENUM ('test', 'midterm', 'final', 'ppt', 'module', 'handout');

CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'approved', 'rejected');

CREATE TYPE "DeviceStatus" AS ENUM ('active', 'revoked');

CREATE TYPE "IssueReason" AS ENUM ('broken_file', 'wrong_file', 'incorrect_category', 'poor_quality', 'other');

CREATE TYPE "IssueStatus" AS ENUM ('pending', 'addressed');

CREATE TYPE "NotificationType" AS ENUM ('premium_approved', 'issue_report_addressed', 'subscription_expiring');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL ,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'student',
    "subscription_status" "SubscriptionStatus" NOT NULL DEFAULT 'none',
    "subscription_expiry_date" TIMESTAMP(3),
    "activation_status" "ActivationStatus" NOT NULL DEFAULT 'pending',
    "last_device_fingerprint" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "device_fingerprint" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "streams" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "streams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" SERIAL NOT NULL,
    "stream_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" SERIAL NOT NULL,
    "department_id" INTEGER NOT NULL,
    "academic_year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resources" (
    "id" SERIAL NOT NULL,
    "course_id" INTEGER NOT NULL,
    "category" "ResourceCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "file_url" TEXT NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "is_free_sample" BOOLEAN NOT NULL DEFAULT false,
    "uploaded_by_admin_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_submissions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "note" TEXT,
    "reviewed_by_admin_id" INTEGER NOT NULL,
    "reviewed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_records" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "device_fingerprint" TEXT NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'active',
    "activated_at" TIMESTAMP(3) NOT NULL,
    "activated_by_admin_id" INTEGER NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revoked_by_admin_id" INTEGER,

    CONSTRAINT "device_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_reports" (
    "id" SERIAL NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "reporter_id" INTEGER NOT NULL,
    "reason" "IssueReason" NOT NULL,
    "other_text" TEXT,
    "status" "IssueStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" "NotificationType" NOT NULL,
    "message" TEXT NOT NULL,
    "related_resource_id" INTEGER,
    "read_status" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_action_logs" (
    "id" SERIAL NOT NULL,
    "admin_id" INTEGER NOT NULL,
    "action_type" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_action_logs_pkey" PRIMARY KEY ("id")
);


CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

CREATE UNIQUE INDEX "streams_name_key" ON "streams"("name");

CREATE INDEX "departments_stream_id_idx" ON "departments"("stream_id");

CREATE UNIQUE INDEX "departments_stream_id_name_key" ON "departments"("stream_id", "name");

CREATE INDEX "courses_department_id_idx" ON "courses"("department_id");

CREATE UNIQUE INDEX "courses_department_id_academic_year_name_key" ON "courses"("department_id", "academic_year", "name");

CREATE INDEX "resources_course_id_category_idx" ON "resources"("course_id", "category");

CREATE INDEX "payment_submissions_user_id_idx" ON "payment_submissions"("user_id");

CREATE INDEX "device_records_user_id_idx" ON "device_records"("user_id");

CREATE INDEX "issue_reports_resource_id_idx" ON "issue_reports"("resource_id");

CREATE INDEX "issue_reports_reporter_id_idx" ON "issue_reports"("reporter_id");

CREATE INDEX "notifications_user_id_read_status_idx" ON "notifications"("user_id", "read_status");

CREATE INDEX "admin_action_logs_admin_id_idx" ON "admin_action_logs"("admin_id");

CREATE INDEX "admin_action_logs_created_at_idx" ON "admin_action_logs"("created_at");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "departments" ADD CONSTRAINT "departments_stream_id_fkey" FOREIGN KEY ("stream_id") REFERENCES "streams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "courses" ADD CONSTRAINT "courses_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "resources" ADD CONSTRAINT "resources_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "resources" ADD CONSTRAINT "resources_uploaded_by_admin_id_fkey" FOREIGN KEY ("uploaded_by_admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_submissions" ADD CONSTRAINT "payment_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_submissions" ADD CONSTRAINT "payment_submissions_reviewed_by_admin_id_fkey" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "device_records" ADD CONSTRAINT "device_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "device_records" ADD CONSTRAINT "device_records_activated_by_admin_id_fkey" FOREIGN KEY ("activated_by_admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "device_records" ADD CONSTRAINT "device_records_revoked_by_admin_id_fkey" FOREIGN KEY ("revoked_by_admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "issue_reports" ADD CONSTRAINT "issue_reports_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "issue_reports" ADD CONSTRAINT "issue_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_related_resource_id_fkey" FOREIGN KEY ("related_resource_id") REFERENCES "resources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "admin_action_logs" ADD CONSTRAINT "admin_action_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "courses"
  ADD CONSTRAINT academic_year_range CHECK (academic_year BETWEEN 1 AND 5);

ALTER TABLE "resources"
  ADD CONSTRAINT file_size_limit CHECK (file_size_bytes <= 2097152);

CREATE UNIQUE INDEX one_active_device_per_user
  ON "device_records" (user_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX one_open_report_per_student_per_resource
  ON "issue_reports" (resource_id, reporter_id)
  WHERE status = 'pending';