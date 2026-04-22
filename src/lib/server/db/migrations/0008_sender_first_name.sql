-- Ajoute un prénom d'expéditeur personnalisable pour les messages
-- (emails / LinkedIn / WhatsApp générés par l'IA).
-- Tombe en fallback sur user.name si la valeur est NULL.

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS sender_first_name text;
