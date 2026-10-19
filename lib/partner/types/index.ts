export type ContractStatus = "active" | "completed" | "terminated"
export type DriverStatus = "active" | "inactive"
/** ประเภทพ้นสภาพ: paid_exit = ผ่อนหมดแล้ว ขอเอารถออกจากระบบ · early_exit = ผ่อนยังไม่หมด โดนปลด/ขอคืนรถ */
export type ExitType = "paid_exit" | "early_exit"
export type UserRole = "admin" | "viewer"

export interface Vehicle {
  _id?: string
  truckType?:      "mixer" | "trailer"  // ประเภทหลัก — โม่ปูน (mixer) / เทรลเลอร์ (trailer)
  vehicleType?:    string   // ประเภทรถ (ข้อความละเอียด เช่น "Mixer 10 ล้อ")
  characteristic?: string  // ลักษณะ
  brand?:          string  // ยี่ห้อ
  model?:          string  // รุ่น
  registrationDate?: string // YYYY-MM-DD วันจดทะเบียน
  color?:          string  // สีรถ
  licensePlate?:   string  // ทะเบียนรถ
  truckNumber?:    string  // เบอร์รถ
  chassisNumber?:  string  // เลขตัวถัง
  engineNumber?:   string  // เลขเครื่อง
  engineSize?:     string  // ขนาดกำลังเครื่องยนต์
  status?:              string  // active / inactive
  registrationDocUrl?:  string  // URL สำเนาทะเบียนรถ
  photoUrl?:            string  // URL รูปรถ (= รูปมุม "หน้า", sync ไปใบเสนอราคา)
  photos?:             { front?: string; back?: string; left?: string; right?: string; cabin?: string }  // รูปรถ 5 มุม
  dataComplete?:     boolean // ติ๊กยืนยันว่าเก็บข้อมูลรถครบถ้วนแล้ว (manual)
  dataExpectedDate?: string  // YYYY-MM-DD วันที่คาดว่าจะเก็บข้อมูลครบ (ถ้ายังไม่ครบ)
  createdAt?: string
  updatedAt?: string
  // ── derived โดย GET /api/vehicles (ไม่ได้เก็บใน DB) ──
  fleetState?: FleetState   // สถานะฝูงรถ: วิ่งงานอยู่ / พร้อมขาย / ระหว่างดำเนินการ / ไม่ใช้งาน
  saleStatus?: SaleStatus | null  // จาก master_price_list (ถ้ามีแถวราคาขาย)
  contractCode?: string     // รหัสสัญญา active ที่ผูกทะเบียนนี้ (ถ้าวิ่งงานอยู่)
}

/** สถานะฝูงรถ (derived): working=มีสัญญา active · ready=ว่าง+พร้อมขาย · preparing=ว่าง+ยังไม่พร้อม · inactive=ไม่ใช้งาน */
export type FleetState = "working" | "ready" | "preparing" | "inactive"
export type SaleStatus = "ready" | "repair15" | "repair30" | "review"

export interface Contract {
  _id?: string
  contractCode: string
  contractDate: string          // ISO date string
  // Driver / personal data
  driverId?:       string       // ref to drivers._id
  companyVersion?: number   // เวอร์ชันข้อมูลบริษัท/ผู้ลงนามที่ใช้ตอนสร้างสัญญา (ดู lib/company-config)
  buyerPrefix?:    string   // คำนำหน้าผู้ซื้อ (นาย/นาง/นางสาว) — ตั้งต้นจากข้อมูล พขร.
  buyerName:       string
  driverName:      string
  birthDate?:      string       // YYYY-MM-DD from driver
  nationalId?:     string       // 13 digits from driver
  driverAddress?:  string       // from driver
  accountNumber:   string
  bankName?:       string
  phone:           string
  plant:           string
  // Vehicle data
  vehicleId?:              string  // ref to vehicle_master._id
  truckNumber:             string
  licensePlate:            string
  vehicleBrand:            string  // ยี่ห้อ
  vehicleModel?:           string  // รุ่น
  vehicleType?:            string  // ประเภทรถ
  vehicleCharacteristic?:  string  // ลักษณะ
  vehicleRegistrationDate?: string // วันจดทะเบียน
  vehicleColor?:           string  // สีรถ
  chassisNumber?:          string  // เลขตัวถัง
  engineNumber?:           string  // เลขเครื่อง
  engineSize?:             string  // ขนาดกำลังเครื่องยนต์
  mileage?:                number  // ระยะทางที่ใช้แล้ว (กม.) — ใช้ในเอกสารสัญญา
  // Financial (from master_price_list, keyed by licensePlate)
  totalPrice:          number   // totalSalePrice
  downPayment:         number   // เงินดาวน์รวม
  cashDown?:           number   // เงินดาวน์สด
  remainingInstallment?: number // งวดดาวน์คงเหลือ
  downInstallmentCount?: number // จำนวนงวดดาวน์
  downInstallmentAmt?: number   // ค่างวดดาวน์
  financeAmount?:      number   // ยอดไฟแนนซ์
  monthlyInstallment:  number   // monthlyPayment
  totalInstallments:   number   // financeInstallments
  startDate: string             // ISO date string
  status: ContractStatus
  notes: string
  ledgerDebtCode?: string       // ถ้าสร้างรายการผ่อนรถใน driver-ledger แล้ว (ผ่อนจริง+หลักฐาน)
  ledgerConvertedAt?: string
  completedAt?: string | null   // ปิดงวดเอง (POST /api/contracts/[id]/close)
  completedBy?: string | null
  locked?: { by: string; at: string } | null  // 🔒 ล็อคโดยแอดมิน — ห้ามแก้จนกว่าจะปลด
  // Insurance / tax fields (from ภาษี ประกัน พรบ sheet)
  insurer?: string
  insuranceCompany?: string
  insuranceAmount?: number
  prbAmount?: number
  taxAmount?: number
  inspectionCost?: number
  taxInsuranceTotalCost?: number
  monthlyInsuranceFee?: number
  taxRenewalDate?: string       // ISO date string YYYY-MM-DD
  taxExpiryDate?: string        // ISO date string YYYY-MM-DD
  taxEndDate?: string           // coverage end date
  taxInstallmentCount?: number
  taxMonthlyInstallment?: number
  taxMonthlyCollection?: number
  taxBalanceRemaining?: number
  taxInstallmentStart?: string
  taxInstallmentEnd?: string
  // Reserve / overdue fields (from เบิกสำรอง sheet)
  dueInstallmentNo?: number
  overdueCount?: number
  overdueAmount?: number
  otherDebtBalance?: number
  repairReserve?: number
  installmentReserve?: number
  totalReserveBalance?: number
  netPayLastMonth?: number
  emergencyDraw?: number
  reserveDraw?: number
  reserveNote?: string
  drawLimit?: number
  reserveAsOfMonth?: string
  payEveryLastDay?: boolean      // จ่ายทุกวันสุดท้ายของเดือน
  saleContractUrl?:      string  // สัญญาซื้อขาย
  promotionDocUrl?:      string  // เอกสารแนบท้าย (โปรโมชั่น)
  hireContractUrl?:      string  // สัญญาว่าจ้าง
  guaranteeContractUrl?: string  // สัญญาค้ำประกัน
  creditorDocUrl?:       string  // เปิดเจ้าหนี้
  // ผู้ค้ำประกัน — ใช้ในเอกสารสัญญาค้ำประกัน
  guarantorName?:       string
  guarantorNationalId?: string
  guarantorAddress?:    string
  // เอกสารแนบผู้ค้ำ (ต่อท้าย PDF สัญญาค้ำประกัน) — รูป jpg/png
  guarantorIdCardUrl?:   string  // บัตรประชาชนผู้ค้ำ
  guarantorHouseRegUrl?: string  // ทะเบียนบ้านผู้ค้ำ
  guarantorSalaryUrl?:   string  // สลิปเงินเดือนผู้ค้ำ
  guarantorWorkCertUrl?: string  // หนังสือรับรองการทำงานผู้ค้ำ
  // ข้อมูลเปิดเจ้าหนี้ — ใช้ในเอกสารเปิดเจ้าหนี้รายใหม่
  buyerNameEn?:        string  // ชื่อเจ้าหนี้ (ภาษาอังกฤษ)
  email?:              string  // Email ผู้ติดต่อ
  bankAccountType?:    string  // ประเภทบัญชี (ออมทรัพย์/กระแสรายวัน)
  bankBranch?:         string  // สาขาธนาคาร
  vendorCodeWinspeed?: string  // รหัสเจ้าหนี้ Winspeed (บัญชีกำหนดหลังเปิด)
  vendorCodeAtms?:     string  // รหัสเจ้าหนี้ ATMS
  attachments?: string[]        // public URLs of uploaded files (legacy)
  createdAt?: string
  updatedAt?: string
}

export interface Driver {
  _id?: string
  prefix?:        string   // คำนำหน้า (นาย/นาง/นางสาว) — default "นาย"
  firstName:      string
  lastName:       string
  birthDate?:     string   // YYYY-MM-DD
  nationalId?:    string   // 13 digits
  address?:       string   // ที่อยู่เต็ม (ประกอบจาก field ย่อยด้านล่างตอนบันทึก)
  addressDetail?: string   // บ้านเลขที่ / หมู่ / ซอย / ถนน
  subdistrict?:   string   // ตำบล/แขวง
  district?:      string   // อำเภอ/เขต
  province?:      string   // จังหวัด
  postalCode?:    string   // รหัสไปรษณีย์
  staffCode?:     string   // รหัสพนักงาน
  phone?:         string   // เบอร์โทรศัพท์
  bankName?:      string   // ธนาคาร
  accountNumber?: string   // เลขที่บัญชี
  idCardUrl?:      string   // URL ภาพบัตรประชาชน
  licenseUrl?:     string   // URL ใบขับขี่
  houseRegUrl?:    string   // URL ทะเบียนบ้าน
  bankBookUrl?:    string   // URL หน้าบุ๊คแบงค์ (ใช้แนบท้ายสัญญาว่าจ้าง)
  tax50BisUrl?:    string   // URL หนังสือรับรองหักภาษี ณ ที่จ่าย (50 ทวิ)
  tax50BisMonthly?: { month: string; url: string }[]  // 50 ทวิ แยกรายเดือน
  photoUrl?:       string   // URL รูปโปรไฟล์พนักงาน
  licenseNumber?:  string   // เลขบัตรใบขับขี่
  licenseType?:    string   // ประเภทใบขับขี่
  licenseExpiry?:  string   // วันหมดอายุ YYYY-MM-DD
  isTruckOwner?:  boolean  // เป็นเจ้าของรถ
  isDriver?:      boolean  // เป็นพนักงานขับรถ
  startDate?:     string   // YYYY-MM-DD เริ่มงานวันที่
  endDate?:       string   // YYYY-MM-DD สิ้นสุด
  // ประวัติการทำงาน เช่น เคยเป็น พจส. ช่วงวันไหนถึงวันไหน (to ว่าง = ปัจจุบัน)
  workHistory?:   { role: string; from?: string; to?: string; note?: string }[]
  status:         DriverStatus
  // พ้นสภาพ (ตั้งเมื่อ status → inactive ผ่าน POST /api/drivers/[id]/exit)
  exitType?:      ExitType
  exitReason?:    string
  exitedAt?:      string   // ISO เวลาที่บันทึกพ้นสภาพ
  createdAt?: string
  updatedAt?: string
  // derived โดย GET /api/drivers (เฉพาะ active) — ไม่เก็บใน DB
  installmentState?: "paying" | "paidoff"
  // legacy — optional so old pages don't break at compile time
  contractCode?: string
  buyerName?:    string
  driverName?:   string
  truckNumber?:  string
  licensePlate?: string
}

export interface PayrollIncomeFields {
  transportFee: number
  ot: number
  otherIncomeWHT: number
  otherIncomeNoWHT: number
}

export interface PayrollDeductionFields {
  fuel: number
  gps: number
  repairInHouse: number
  repairOutside: number
  mgmtFee8pct: number
  labor: number
  tire: number
  tirePatch: number
  carWash: number
  taxInsurance: number
  installment: number
  repairInstallment: number
  downPaymentInstallment: number
}

export interface PayrollEntry extends PayrollIncomeFields, PayrollDeductionFields {
  _id?: string
  contractCode: string
  month: string                 // "YYYY-MM"
  workingDays: number
  tripCount: number
  totalIncome: number
  totalDeductions: number
  netPay: number
  // ── เฟส 5: รายการแยกบรรทัด + หนี้ยกยอด (optional — เอกสารเก่าไม่มี) ──
  otherDeductWHT?: number       // หักอื่นๆ หัก ณ ที่จ่าย (ปรับปรุง + extras)
  otherDeductNoWHT?: number     // หักอื่นๆ ไม่หักภาษี
  attendanceAllowance?: number  // เบี้ยวันทำงาน 5 ตัว (สูตร=ได้)
  fuelOverCharge?: number       // น้ำมันเกินเรต + ค่าปรับ (หัก)
  fuelUnderRefund?: number      // คืนน้ำมันต่ำกว่าเรต (รับ)
  ledgerDeduction?: number
  ledgerItems?: { entryId: string; debtCode: string; label: string; amount: number }[]
  extrasItems?: { label: string; kind: string; amount: number; wht: boolean }[]
  carryIn?: number              // หนี้ยกมาจากงวดก่อน
  payable?: number              // ยอดจ่ายจริง = netPay − carryIn
  carryOut?: number             // หนี้ยกไปงวดหน้า
  whtBase?: number              // ฐานภาษีหัก ณ ที่จ่าย
  whtAmount?: number            // WHT 3%
  paidNet?: number              // ยอดโอนสุทธิหลัง WHT
  createdAt?: string
  updatedAt?: string
}

export interface Trip {
  _id?: string
  contractCode: string
  date: string                  // ISO date string
  ldtNumber: string
  plant: string
  serviceType: string
  routeCode: string
  destinationName: string
  district: string
  province: string
  zone: string
  tripFee: number
  createdAt?: string
}

export interface PayrollComputed {
  totalIncome: number
  totalDeductions: number
  netPay: number
}

export interface PromoConfig {
  _id?: string
  contractCode?: string
  licensePlate: string
  repairBudget: number
  pmOilCost: number
  annualPmCap: number
  createdAt?: string
}

export interface RepairClaim {
  _id?: string
  contractCode: string
  date: string
  description: string
  /** เลขที่ใบ MR (ใช้จับคู่กับรายการเบิกคลัง) — เดิมเก็บใน description */
  mr?: string
  amount: number
  /** ทีมยืนยันตัดงบโปรฯ แล้ว — ประวัติเก่าที่ไม่มี field นี้ = รอยืนยัน (ไม่ตัดงบ) */
  confirmed?: boolean
  /** จองงบ (reserve) — บันทึกซ่อมด้วยมือ อิงจากใบ MR ยังไม่ตัดงบจริง จนกว่าจะเปลี่ยนเป็น actual */
  reserve?: boolean
  createdAt?: string
}

export interface PmRecord {
  _id?: string
  contractCode: string
  year: number
  type: "PM1" | "PM2"
  date: string
  amount: number
  notes: string
  /** ทีมยืนยันตัดเพดานแล้ว — รายการที่ไม่มี field นี้ = รอยืนยัน (ไม่ตัดเพดาน) */
  confirmed?: boolean
  createdAt?: string
}

export interface PromoSummaryRow {
  contractCode: string
  licensePlate: string
  driverName: string
  truckNumber: string
  repairBudget: number
  repairUsed: number
  repairRemaining: number
  annualPmCap: number
  pmUsedThisYear: number
  pmRemainingThisYear: number
  pmWindowFrom?: string | null   // รอบปี PM ปัจจุบัน (นับจากวันเริ่มสัญญา)
  pmWindowTo?: string | null
  pm1UsedThisYear: boolean
  pm2UsedThisYear: boolean
}

/** warehouse-sourced usage record (stock_movements grouped by MR) — read-only here */
export interface StockUsageRecord {
  mr: string
  date: string
  amount: number
  source: "claim" | "stock" | "both"
  itemCount?: number
  pmType?: string
}

export interface PromoDetail extends PromoSummaryRow {
  pmOilCost: number
  repairClaims: RepairClaim[]
  pmRecords: PmRecord[]
  /** repair usage recorded via vehicle-cost page (stock movements, not in repairClaims) */
  stockRepairs?: StockUsageRecord[]
  /** PM usage recorded via vehicle-cost page */
  stockPm?: StockUsageRecord[]
  /** MR numbers present in BOTH repairClaims and stock movements (counted once) */
  dedupedMrs?: string[]
}

export interface GpsConfig {
  _id?: string
  contractCode: string
  truckNumber: string
  licensePlate: string
  vendor: string
  installDate?: string
  boxNumber: string
  chassisNumber: string
  startDate?: string
  fleet: string
  plant: string
  monthlyFee: number
}

export interface InstallmentSchedule {
  _id?: string
  contractCode: string
  monthlyAmount: number
  updatedAt?: string
}

export interface FuelRecord {
  _id?: string
  contractCode: string
  month: string
  deductionAmount: number
}

export interface MonthlyAdjustment {
  _id?: string
  contractCode: string
  month: string
  otherIncomeWHT: number
  otherIncomeNoWHT: number
  otherDeductWHT: number
  otherDeductNoWHT: number
  note?: string
  updatedAt?: string
}

export type MonthPhase = "draft" | "review" | "approved" | "locked"

export interface MonthStatus {
  _id?: string
  month: string
  phase: MonthPhase
  updatedAt: string
  updatedBy?: string
  notes?: string
}

export interface RepairMonthly {
  _id?: string
  contractCode: string
  month: string
  driverName?: string
  truckNumber?: string
  licensePlate?: string
  partsAmount: number
  tireAmount: number
  tirePatchAmount: number
  cleaningAmount: number
  outsideRepairAmount: number
  managementFee: number
  laborAmount: number
  totalRepair: number
  liabilityTotal?: number
  liabilityThisMonth?: number
}
