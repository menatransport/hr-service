import type { SelectGroupOption, SelectOption } from "@/components/ui/field";

import type { VehicleKind } from "./types";

/**
 * ยี่ห้อ / รุ่น / สี ของรถในประเทศไทย — ตัวเลือก dropdown ของฟอร์มลงทะเบียนรถ (24 พ.ย. 2569)
 *
 * รวบรวมจากรุ่นที่ขายหรือยังวิ่งอยู่มากในไทยช่วงปี 2015–2026 (รวมรุ่นเลิกขายที่ยังพบบ่อย เช่น Chevrolet)
 * เรียงยี่ห้อตามยอดจดทะเบียนโดยประมาณ แบ่งกลุ่มญี่ปุ่น / จีน–EV / ยุโรป–อเมริกา–เกาหลี
 * · รถจักรยานยนต์กับรถบรรทุก (“อื่น ๆ”) มีรายการของตัวเอง
 * · ไม่เจอในรายการ → เลือก `OTHER` แล้วพิมพ์เอง (รุ่นใหม่ออกทุกปี รายการนี้ไม่มีทางครบ)
 *
 * เพิ่มรุ่นใหม่ = เติมในอาร์เรย์ของยี่ห้อนั้นที่นี่ที่เดียว
 */

/** ค่าพิเศษของ dropdown — “ไม่มีในรายการ พิมพ์เอง” */
export const OTHER = "__other__";

type Catalog = { group: string; brands: Record<string, string[]> }[];

const CARS: Catalog = [
  {
    group: "ญี่ปุ่น",
    brands: {
      Toyota: [
        "Yaris", "Yaris Ativ", "Yaris Cross", "Vios", "Corolla Altis", "Corolla Cross", "Camry", "C-HR",
        "Sienta", "Avanza", "Veloz", "Innova", "Innova Zenix", "Fortuner", "Hilux Revo", "Hilux Champ",
        "Hilux Travo", "Commuter", "Majesty", "Alphard", "Vellfire", "bZ4X", "Prius",
      ],
      Honda: [
        "Brio", "Jazz", "City", "City Hatchback", "Civic", "Civic Type R", "Accord", "BR-V", "WR-V",
        "HR-V", "CR-V", "Mobilio", "Odyssey", "e:N1",
      ],
      Isuzu: ["D-Max Spark", "D-Max Cab4", "D-Max Hi-Lander", "D-Max V-Cross", "D-Max X-Series", "D-Max EV", "MU-X"],
      Mitsubishi: ["Mirage", "Attrage", "Xpander", "Xpander Cross", "Xforce", "Triton", "Pajero Sport", "Outlander PHEV", "Space Wagon"],
      Nissan: ["March", "Almera", "Note", "Sylphy", "Teana", "Kicks e-POWER", "Juke", "X-Trail", "Terra", "Navara", "Urvan", "Leaf"],
      Mazda: ["Mazda2", "Mazda3", "CX-3", "CX-30", "CX-5", "CX-8", "CX-60", "BT-50", "MX-5"],
      Suzuki: ["Celerio", "Swift", "Ciaz", "Ertiga", "XL7", "Fronx", "Jimny", "Carry"],
      Subaru: ["XV / Crosstrek", "Forester", "Outback", "BRZ"],
      Lexus: ["UX", "ES", "IS", "NX", "RX", "RZ", "LM", "LX"],
    },
  },
  {
    group: "จีน · รถไฟฟ้า (EV)",
    brands: {
      BYD: ["Dolphin", "Atto 2", "Atto 3", "Seal", "Sealion 5", "Sealion 6", "Sealion 7", "M6", "Seal 5"],
      MG: ["MG3", "MG5", "MG ZS", "MG ZS EV", "MG HS", "MG HS PHEV", "MG VS HEV", "MG4 Electric", "MG EP", "MG S5 EV", "Cyberster", "Extender", "Maxus 9"],
      GWM: ["Haval H6", "Haval Jolion", "Haval H6 PHEV", "ORA Good Cat", "ORA 07", "Tank 300", "Tank 500", "Cannon"],
      Neta: ["Neta V", "Neta V-II", "Neta X"],
      Changan: ["Deepal S07", "Deepal L07", "Lumin", "Avatr 11"],
      GAC: ["Aion Y Plus", "Aion ES", "Aion V", "Hyptec HT", "M8"],
      Wuling: ["Air EV", "Bingo"],
      Zeekr: ["X", "001", "009", "7X"],
      Xpeng: ["G6", "X9"],
      Chery: ["Omoda C5 EV", "Jaecoo 6 EV", "Jaecoo 7", "Tiggo 7", "Tiggo 8"],
      Geely: ["EX5", "Coolray"],
      Leapmotor: ["C10", "C11", "T03"],
    },
  },
  {
    group: "ยุโรป · อเมริกา · เกาหลี",
    brands: {
      Ford: ["Ranger", "Ranger Raptor", "Ranger PHEV", "Everest", "Territory", "Mustang", "Mustang Mach-E", "Fiesta", "Focus", "EcoSport"],
      Chevrolet: ["Spark", "Sonic", "Cruze", "Spin", "Captiva", "Trailblazer", "Colorado"],
      Hyundai: ["Creta", "Stargazer", "Tucson", "Ioniq 5", "Ioniq 6", "H-1", "Staria"],
      Kia: ["Carnival", "Sorento", "Sportage", "EV5", "EV6", "EV9"],
      "Mercedes-Benz": ["A-Class", "C-Class", "E-Class", "S-Class", "CLA", "GLA", "GLB", "GLC", "GLE", "GLS", "EQA", "EQB", "EQE", "EQS", "Vito / V-Class"],
      BMW: ["1 Series", "2 Series", "3 Series", "4 Series", "5 Series", "7 Series", "X1", "X3", "X4", "X5", "X7", "iX1", "iX3", "iX", "i4", "i5", "i7"],
      Volvo: ["XC40", "EX30", "EX40", "XC60", "XC90", "S60", "S90", "EM90"],
      Audi: ["A3", "A4", "A6", "Q2", "Q3", "Q5", "Q7", "Q8 e-tron", "e-tron GT"],
      Porsche: ["Macan", "Cayenne", "Panamera", "Taycan", "911"],
      MINI: ["Cooper", "Countryman", "Aceman", "Clubman"],
      Peugeot: ["2008", "3008", "5008"],
      Tesla: ["Model 3", "Model Y"],
    },
  },
];

const MOTORCYCLES: Catalog = [
  {
    group: "รถจักรยานยนต์",
    brands: {
      Honda: [
        "Wave 110i", "Wave 125i", "Super Cub", "Dream Super Cub", "Click 125i", "Click 160", "Scoopy",
        "Giorno+", "Lead 125", "Stylo 160", "PCX160", "ADV160", "ADV350", "Forza 350", "CT125", "Monkey",
        "CB150R", "CBR150R", "CBR250RR", "CB300R", "Rebel 300", "Rebel 500", "EM1 e:",
      ],
      Yamaha: [
        "Finn", "Fino", "Fazzio", "Grand Filano", "QBIX", "GT125", "Exciter 155", "NMAX", "Aerox",
        "XMAX", "YZF-R15", "YZF-R3", "MT-15", "MT-03", "XSR155",
      ],
      Suzuki: ["Smash", "Raider R150", "Burgman Street", "Address", "GSX-R150", "V-Strom 250"],
      Kawasaki: ["W175", "KLX230", "Z400", "Z650", "Z900", "Ninja 400", "Ninja 650", "Versys 650"],
      Vespa: ["Primavera", "Sprint", "LX 125", "GTS", "GTV"],
      GPX: ["Popz", "Drone", "Legend", "Demon GR200R", "Gentleman"],
      "Royal Enfield": ["Hunter 350", "Classic 350", "Meteor 350", "Himalayan", "Interceptor 650", "Continental GT 650"],
      Lambretta: ["V125", "V200", "X300"],
      Stallions: ["Centaur", "CT 150", "Ranger"],
      Triumph: ["Speed 400", "Scrambler 400 X", "Trident 660", "Street Twin", "Bonneville"],
      "BMW Motorrad": ["G 310 R", "G 310 GS", "R 1250 GS", "R nineT", "CE 04"],
      "Harley-Davidson": ["Nightster", "Sportster S", "Street Bob", "Fat Boy", "X350"],
      Ducati: ["Scrambler", "Monster", "Panigale", "Multistrada"],
      "จักรยานยนต์ไฟฟ้า": ["Yadea", "Deco", "Niu", "H SEM", "Etran", "Felo"],
    },
  },
];

/** “อื่น ๆ” = รถบรรทุก / รถตู้ / รถเพื่อการพาณิชย์ — รถบรรทุกก่อน แล้วตามด้วยรถตู้/กระบะจากยี่ห้อรถยนต์ */
const OTHERS: Catalog = [
  {
    group: "รถบรรทุก",
    brands: {
      Hino: ["300 Series", "500 Series", "700 Series", "Victor", "Mega"],
      Isuzu: ["NLR", "NMR", "NPR", "FRR", "FTR", "FVM", "GXZ", "Deca"],
      "Mitsubishi Fuso": ["Canter", "Fighter", "Super Great"],
      "UD Trucks": ["Quester", "Croner", "Quon"],
      Volvo: ["FH", "FM", "FMX"],
      Scania: ["P-Series", "G-Series", "R-Series"],
      "Mercedes-Benz": ["Actros", "Arocs"],
      Sany: ["Mixer", "Tractor"],
      Foton: ["Aumark", "Auman"],
    },
  },
  {
    group: "รถตู้ · กระบะ",
    brands: {
      Toyota: ["Commuter", "Hiace", "Hilux Revo", "Hilux Champ"],
      Isuzu: ["D-Max", "D-Max Spark"],
      Nissan: ["Urvan", "Navara"],
      Hyundai: ["H-1", "Staria"],
      Ford: ["Ranger", "Transit"],
      "Mitsubishi": ["Triton"],
      Suzuki: ["Carry"],
    },
  },
];

const CATALOG: Record<VehicleKind, Catalog> = { car: CARS, motorcycle: MOTORCYCLES, other: OTHERS };

const otherOption = (label: string): SelectOption => ({ value: OTHER, label });

/** ยี่ห้อของประเภทยานพาหนะนี้ เป็นกลุ่ม + ท้ายสุด “ไม่มีในรายการ” */
export function brandGroups(kind: VehicleKind): SelectGroupOption[] {
  return [
    ...CATALOG[kind].map(({ group, brands }) => ({
      label: group,
      options: Object.keys(brands).map((b) => ({ value: b, label: b })),
    })),
    { label: "อื่น ๆ", options: [otherOption("ยี่ห้ออื่น (พิมพ์เอง)")] },
  ];
}

/** รุ่นของยี่ห้อนี้ (รวมทุกกลุ่มของประเภทนั้น ไม่ซ้ำ) + “รุ่นอื่น” · ยี่ห้อนอกรายการ = มีแค่ “รุ่นอื่น” */
export function modelOptions(kind: VehicleKind, brand: string): SelectOption[] {
  const models = new Set(CATALOG[kind].flatMap(({ brands }) => brands[brand] ?? []));
  return [...[...models].map((m) => ({ value: m, label: m })), otherOption("รุ่นอื่น (พิมพ์เอง)")];
}

export const isKnownBrand = (kind: VehicleKind, brand: string) =>
  CATALOG[kind].some(({ brands }) => brand in brands);

export const isKnownModel = (kind: VehicleKind, brand: string, model: string) =>
  CATALOG[kind].some(({ brands }) => brands[brand]?.includes(model));

/** สีตามที่เขียนในเล่มทะเบียน (กรมการขนส่งทางบก) เรียงตามที่พบบ่อย */
export const COLORS = [
  "ขาว", "ขาวมุก", "ดำ", "เทา", "บรอนซ์เงิน", "บรอนซ์ทอง", "เงิน", "แดง", "น้ำเงิน", "ฟ้า",
  "น้ำตาล", "ทอง", "เขียว", "ส้ม", "เหลือง", "ครีม", "ม่วง", "ชมพู", "หลายสี",
];

export const isKnownColor = (color: string) => COLORS.includes(color);

export const colorOptions = (): SelectOption[] => [
  ...COLORS.map((c) => ({ value: c, label: c })),
  otherOption("สีอื่น (พิมพ์เอง)"),
];
