/** Валідація payload налаштувань калькулятора стяжки (матриця марок + тарифи). */
import { z } from "zod";

const num = z.number().finite().nonnegative();

export const gradeRecipeSchema = z.object({
  strengthMPa: num,
  sandTonsPer7m3: num,
  cementM500BagsPer7m3: num,
  cementM400BagsPer7m3: num,
  fiberPacksPer7m3: num,
  plasticizerLitersPer7m3: num,
});

export const productionConfigSchema = z.object({
  sandPricePerTon: num,
  cementM400BagPrice: num,
  cementM500BagPrice: num,
  fiberPackPrice: num,
  plasticizerPricePerL: num,
  filmPricePerM2: num,
  damperPricePerM: num,
  dieselPricePerL: num,
  dieselLitersPer100m2: num,
  filmCoef: num,
  cementBagKg: z.number().finite().positive(),
  fiberPackKg: z.number().finite().positive(),
  brigadeMinCost: num,
  brigadePerM2Over100: num,
  cementUnloadPerBag: num,
  meshPerM2: num,
  slopePerM2: num,
  baseThicknessCm: num,
  extraThicknessPerCmPerM2: num,
  stationDeliveryCost: num,
  sandTruckCost: num,
  sandTruckCapacityTons: z.number().finite().positive(),
  cementDeliveryCost: num,
});

export const screedConfigPayloadSchema = z.object({
  grades: z.object({
    M100: gradeRecipeSchema,
    M150: gradeRecipeSchema,
    M200: gradeRecipeSchema,
    M250: gradeRecipeSchema,
    M300: gradeRecipeSchema,
  }),
  config: productionConfigSchema,
});
