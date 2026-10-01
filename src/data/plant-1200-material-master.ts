export interface PlantMaterialRow {
  materialNumber: string;
  materialDescription: string;
  materialType: string;
  materialStatus: "Active" | "Inactive";
  baseUOM?: string;
  plant?: string;
  lastSAPRefresh?: string;
}

export const PLANT_1200_MATERIAL_MASTER: PlantMaterialRow[] = [
  {
    materialNumber: "68-000018",
    materialDescription: "Control Material 68-000018 (HALB)",
    materialType: "HALB",
    materialStatus: "Active",
    baseUOM: "EA",
    plant: "1200",
    lastSAPRefresh: "2025-09-24T06:00:00.000Z",
  },
  {
    materialNumber: "68-000019",
    materialDescription: "Control Material 68-000019 (HALB)",
    materialType: "HALB",
    materialStatus: "Active",
    baseUOM: "EA",
    plant: "1200",
    lastSAPRefresh: "2025-09-24T06:00:00.000Z",
  },
  {
    materialNumber: "72-100001",
    materialDescription: "Finished Product 72-100001 (FERT)",
    materialType: "FERT",
    materialStatus: "Active",
    baseUOM: "EA",
    plant: "1200",
    lastSAPRefresh: "2025-09-24T06:00:00.000Z",
  },
  {
    materialNumber: "00045678",
    materialDescription: "Raw Material 00045678 (HALB)",
    materialType: "HALB",
    materialStatus: "Active",
    baseUOM: "KG",
    plant: "1200",
    lastSAPRefresh: "2025-09-24T06:00:00.000Z",
  },
  {
    materialNumber: "0100-0013",
    materialDescription: "Finished Product 0100-0013 (FERT)",
    materialType: "FERT",
    materialStatus: "Active",
    baseUOM: "EA",
    plant: "1200",
    lastSAPRefresh: "2025-09-24T06:00:00.000Z",
  },
  {
    materialNumber: "V-104AB",
    materialDescription: "Specialty Reagent V-104AB (HALB)",
    materialType: "HALB",
    materialStatus: "Inactive",
    baseUOM: "ML",
    plant: "1200",
    lastSAPRefresh: "2025-09-24T06:00:00.000Z",
  },
];
