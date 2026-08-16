-- Phone numbers are stored in normalized E.164 form by the users module.
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
