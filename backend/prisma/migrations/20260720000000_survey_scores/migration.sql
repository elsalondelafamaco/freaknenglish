-- Encuesta de calidad: 3 escalas adicionales (profesor / contenido / plataforma).
-- Las columnas son opcionales para preservar respuestas legacy donde sólo se
-- registró el NPS principal.
ALTER TABLE "satisfaction_surveys" ADD COLUMN "teacher_score"  INTEGER;
ALTER TABLE "satisfaction_surveys" ADD COLUMN "content_score"  INTEGER;
ALTER TABLE "satisfaction_surveys" ADD COLUMN "platform_score" INTEGER;