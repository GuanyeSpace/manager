ALTER TABLE "LiveReport" ADD COLUMN "femaleHundredths" INTEGER, ADD COLUMN "age31To40Hundredths" INTEGER;
ALTER TABLE "LiveReport" ADD CONSTRAINT "LiveReport_female_range" CHECK ("femaleHundredths" BETWEEN 0 AND 10000), ADD CONSTRAINT "LiveReport_age_range" CHECK ("age31To40Hundredths" BETWEEN 0 AND 10000);
