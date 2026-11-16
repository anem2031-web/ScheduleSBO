-- Apply before enabling schedule templates with a recipient acknowledgment button.
ALTER TABLE `whatsapp_delivery_events`
  MODIFY COLUMN `status` enum('sent','delivered','read','failed','acknowledged') NOT NULL;
