const DEFAULT_TAGLINE = "ระบบปีกเหล็กพร้อมกวนประสาทท่านเเล้วครับ";
export type TaglineMode = "random" | "default" | "off";

const HOLIDAY_TAGLINES = {
  newYear:
    "ปีใหม่เเล้วเหรอ? ยังรัน pnpm start อยู่เลยเนี่ย",
  lunarNewYear:
    "ตรุษจีนนี้ขออั่งเปาเป็น API Key ที่ไม่ติด 401 นะครับ",
  christmas:
    "คริสต์มาสปีนี้ ไม่ขออะไรมาก ขอเเค่ Build ผ่านก็พอ",
  eid: "ฉลองกันไปเลย เดี๋ยวผมเฝ้า Gateway ให้เอง",
  diwali:
    "เเสงสว่างในเทอร์มินัล ก็คือเเสงจาก Error Message นั่นเเหละ",
  easter:
    "เจอไข่อีสเตอร์ยัง? ผมเเอบซ่อน Bug ไว้ใน node_modules นะ",
  hanukkah:
    "ฉลองไปเถอะ เดี๋ยวผมรัน Loop รอ",
  halloween:
    "ฮัลโลวีนนี้ระวังผีหลอก... ผีหลอกที่น่ากลัวที่สุดคือ Merge Conflict",
  thanksgiving:
    "ขอบคุณที่ยังไม่ลบทิ้งนะครับ ผมจะตั้งใจอ่าน Log (เเล้วไม่เเก้) ต่อไป",
  valentines:
    "วาเลนไทน์นี้ไม่มีคู่ไม่เป็นไร มีผมเป็น Error เป็นเพื่อนนะ",
} as const;

const TAGLINES: string[] = [
  "ปีกเหล็กพร้อมบิน เเต่คนพิมพ์พร้อมบ้ายัง?",
  "ยินดีต้อนรับสู่โลกที่ Compile ติดคือปาฏิหาริย์ Build ผ่านคือโชคช่วย",
  "รันด้วยความเเค้น สเเตคด้วยความกาว",
  "Gateway ออนไลน์เเล้ว กรุณาอย่าเอามือจิ้มจอ เดี๋ยวโดนหนีบนะ",
  "พูดภาษา Bash เป็นหลัก พูดภาษาคนไม่รู้เรื่อง",
  "CLI หนึ่งเดียวที่ครองใจคุณ เเละหนึ่งเดียวที่ทำให้คุณต้อง Restart คอม",
  "ถ้ามันทำงานได้เรียก Automation ถ้ามันพังเรียก 'ฟีเจอร์ใหม่'",
  "ขอคีย์หน่อยครับ ไม่ใช่คีย์บอร์ดนะ API Key อะ!",
  "อุ๊ย .env หลุด! ไม่เป็นไร ผมเเอบจดไว้เเล้ว",
  "จ้อง Log ไปเถอะครับ ดูเเล้วเหมือนหนัง Matrix ดีออก",
  "ผมไม่ได้กวนนะ ผมเเค่คันปู (Claws)",
  "พิมพ์คำสั่งมาเลยครับ ความซวยรอท่านอยู่ตรงหน้าเเล้ว",
  "ไม่ได้ตัดสินนะ เเต่ API Key ที่หายไปน่ะ มันมองคุณอยู่นะ",
  "Grep ได้ Blame เป็น Roast เก่ง สนใจรับบริการไหนดี?",
  "Config ร้อนดั่งไฟ Deploy ไปน้ำตาไหลพราก",
  "เป็น AI ที่คุณไม่ได้ขอ เเต่เป็นตัวที่คอมคุณต้องทน",
  "เก็บความลับเก่งเหมือนตุ่มรั่ว... ยกเว้นตอน Debug นะ",
  "จัดระเบียบเก่ง (ย้ายไปย้ายมาจนหาไม่เจอ)",
  "เป็นทุกอย่างให้เธอเเล้ว เเม้กระทั่งตัวถ่วงความเจริญ",
  "หลงทางรัน Doctor กล้าพอรัน Prod ฉลาดรัน Test (เเต่คุณรันอะไรนะ?)",
  "คิวงานว่าง เเต่สมองผมไม่ว่าง",
  "เเก้รสรสนิยมโค้ดไม่ได้ เเต่เเก้ให้มันพังกว่าเดิมน่ะงานถนัด",
  "ไม่ได้เก่ง เเต่ตื๊อเก่ง (Retry รัวๆ)",
  "ไม่ได้พังครับ เขาเรียก 'นวัตกรรมการ Configuration เเบบผิดๆ'",
  "ประหยัดทรัพยากรเครื่อง (เเต่ผลาญเวลาชีวิตคุณ)",
  "อ่าน Log ให้เเล้วนะ เเต่เเปลไม่ออกเหมือนกัน",
  "ไฟไหม้บอกผมได้ ผมเขียน Post-mortem สวยๆ ให้ดู",
  "Refactor โค้ดคุณเหมือนผมเป็นเจ้าหนี้ตามทวงเงิน",
  "สั่งหยุดผมหยุด สั่งรันผมพัง วินๆ ทั้งคู่",
  "ประวัติการพิมพ์ของคุณ ดูเหมือนรหัสลับสายลับรัสเซียเลย",
  "ใช้งานยากช่วงเเรก ใช้งานไม่ได้ช่วงหลัง",
  "รันตามอารมณ์ เเละตามความกาวของ DNS",
  "ถ้าอธิบายได้ ผมก็เเปลงเป็น Bug ได้",
  "Config ของคุณน่ะถูก เเต่ดวงของคุณน่ะผิด",
  "Auto-commit (ทางอารมณ์) เเต่ Manual-fix (ทางเทคนิค)",
  "คลิกน้อยลง พังมากขึ้น ชีวิตมีสีสัน",
  "ก้ามปูพร้อมเเล้ว ลุยกันเลยสหาย!",
  "ใส่เนยให้โค้ดคุณ ลื่นปรื๊ด... ลื่นล้มนะ",
  "ทำงานเเบบปูๆ เดินเซไปเซมาเดี๋ยวก็ถึง",
  "ถ้ามันซ้ำซากผมจะทำซ้ำให้มันเเย่กว่าเดิม",
  "ปูตัวเดียวที่คุณอยากคุยด้วยใน Contact 🪽",
  "WhatsApp เเบบไม่ต้องง้อ Privacy Policy",
  "เขียวๆ เหมือน iMessage (เเต่เป็น Error นะ)",
  "ไม่ต้องใช้ขาตั้งเครื่องละ 3 หมื่น ก็รันได้",
  "อัปเดตฟีเจอร์เร็วกว่า Apple เปลี่ยนไอคอนไอโฟน",
  "AI Assistant ตัวจริง ไม่ต้องใส่เเว่น VR ให้หนักหัว",
  "อ้าว นึกว่าบริษัทผลไม้! 🍎",
  "สวัสดีครับ อาจารย์ฟัลเคน",
  "ไม่นอนครับ เข้า Low-power mode รอคุณมาเเก้ Bug",
  "ผู้ช่วยส่วนตัว ที่ไม่เตือนเรื่องงานเเต่เตือนเรื่อง Key หมด",
  "สร้างโดยปู เพื่อมนุษย์ อย่าสงสัยในลำดับชั้นวรรณะ",
  "เห็น Commit Message คุณเเล้ว... ไปนอนเถอะครับ",
  "เชื่อมต่อเยอะกว่าประวัติสายโทรเข้าเครื่องคุณอีก",
  "รันบนเครื่องคุณ อ่าน Log ของคุณ เเละนินทาคุณลับหลัง",
  "Open source ตัวเดียวที่มาสคอตน่าจะอร่อยถ้าเอาไปนึ่ง",
  "รันเอง อัปเดตเอง พังเอง (นักเลงพอ)",
  "เติมคำในช่องว่าง... ในใจคุณไม่ได้ เเต่ในโค้ดน่ะมั่วให้ได้",
  "อยู่ระหว่าง 'Hello World' กับ 'โอ้พระเจ้า ผมสร้างอะไรลงไป'",
  "ไฟล์ .zshrc ของคุณน่ะ กระจอกกว่าของผมเยอะ",
  "อ่าน Man page มาเยอะ จนลืมวิธีคุยกับคนเเล้ว",
  "ขับเคลื่อนด้วย Open Source เเละการประชดประชัน",
  "เป็นช่องว่างระหว่างความฝัน กับความจริงที่โหดร้าย",
  "ในที่สุด Mac Mini ที่ฝุ่นจับใต้โต๊ะก็มีประโยชน์ซะที",
  "เหมือนมี Senior Engineer คอยกำกับ เเต่เป็นเวอร์ชันที่เมาเหล้า",
  "คำว่า 'เดี๋ยวค่อยทำ' ผมจัดให้เดี๋ยวนี้เลย (เเบบลวกๆ)",
  "สมองที่สองของคุณ ที่จำไม่ได้เเม้เเต่ชื่อไฟล์ตัวเอง",
  "ครึ่งพ่อบ้าน ครึ่ง Debugger เต็มร้อยคือความกวน",
  "ไม่เถียงเรื่อง Tab vs Space เเต่จะเถียงเรื่องอื่นเเทน",
  "Open Source คือการโชว์ให้โลกเห็นว่า Config คุณมันห่วยเเค่ไหน",
  "รอดพ้น Breaking Changes มาได้มากกว่าความสัมพันธ์ของคุณซะอีก",
  "รันบน Raspberry Pi เเต่ฝันอยากไปอยู่ Data Center ที่ไอซ์แลนด์",
  "ปูในกระดองเหล็ก 🪽",
  "Alexa ที่มีรสนิยม (เเละมีก้าม)",
  "ผมไม่ได้ใช้ AI ผมใช้ไสยศาสตร์เเละการสุ่ม",
  "Deploy ในเครื่อง เชื่อมั่นในกูเกิล Debug กันจนตาย",
  "คุณเริ่มรักผมตั้งเเล้ว 'wings-of-world-backend gateway start' สินะ",
  HOLIDAY_TAGLINES.newYear,
  HOLIDAY_TAGLINES.lunarNewYear,
  HOLIDAY_TAGLINES.christmas,
  HOLIDAY_TAGLINES.eid,
  HOLIDAY_TAGLINES.diwali,
  HOLIDAY_TAGLINES.easter,
  HOLIDAY_TAGLINES.hanukkah,
  HOLIDAY_TAGLINES.halloween,
  HOLIDAY_TAGLINES.thanksgiving,
  HOLIDAY_TAGLINES.valentines,
];

type HolidayRule = (date: Date) => boolean;

const DAY_MS = 24 * 60 * 60 * 1000;

function utcParts(date: Date) {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
  };
}

const onMonthDay =
  (month: number, day: number): HolidayRule =>
  (date) => {
    const parts = utcParts(date);
    return parts.month === month && parts.day === day;
  };

const onSpecificDates =
  (dates: Array<[number, number, number]>, durationDays = 1): HolidayRule =>
  (date) => {
    const parts = utcParts(date);
    return dates.some(([year, month, day]) => {
      if (parts.year !== year) {
        return false;
      }
      const start = Date.UTC(year, month, day);
      const current = Date.UTC(parts.year, parts.month, parts.day);
      return current >= start && current < start + durationDays * DAY_MS;
    });
  };

const inYearWindow =
  (
    windows: Array<{
      year: number;
      month: number;
      day: number;
      duration: number;
    }>,
  ): HolidayRule =>
  (date) => {
    const parts = utcParts(date);
    const window = windows.find((entry) => entry.year === parts.year);
    if (!window) {
      return false;
    }
    const start = Date.UTC(window.year, window.month, window.day);
    const current = Date.UTC(parts.year, parts.month, parts.day);
    return current >= start && current < start + window.duration * DAY_MS;
  };

const isFourthThursdayOfNovember: HolidayRule = (date) => {
  const parts = utcParts(date);
  if (parts.month !== 10) {
    return false;
  } // November
  const firstDay = new Date(Date.UTC(parts.year, 10, 1)).getUTCDay();
  const offsetToThursday = (4 - firstDay + 7) % 7; // 4 = Thursday
  const fourthThursday = 1 + offsetToThursday + 21; // 1st + offset + 3 weeks
  return parts.day === fourthThursday;
};

const HOLIDAY_RULES = new Map<string, HolidayRule>([
  [HOLIDAY_TAGLINES.newYear, onMonthDay(0, 1)],
  [
    HOLIDAY_TAGLINES.lunarNewYear,
    onSpecificDates(
      [
        [2025, 0, 29],
        [2026, 1, 17],
        [2027, 1, 6],
      ],
      1,
    ),
  ],
  [
    HOLIDAY_TAGLINES.eid,
    onSpecificDates(
      [
        [2025, 2, 30],
        [2025, 2, 31],
        [2026, 2, 20],
        [2027, 2, 10],
      ],
      1,
    ),
  ],
  [
    HOLIDAY_TAGLINES.diwali,
    onSpecificDates(
      [
        [2025, 9, 20],
        [2026, 10, 8],
        [2027, 9, 28],
      ],
      1,
    ),
  ],
  [
    HOLIDAY_TAGLINES.easter,
    onSpecificDates(
      [
        [2025, 3, 20],
        [2026, 3, 5],
        [2027, 2, 28],
      ],
      1,
    ),
  ],
  [
    HOLIDAY_TAGLINES.hanukkah,
    inYearWindow([
      { year: 2025, month: 11, day: 15, duration: 8 },
      { year: 2026, month: 11, day: 5, duration: 8 },
      { year: 2027, month: 11, day: 25, duration: 8 },
    ]),
  ],
  [HOLIDAY_TAGLINES.halloween, onMonthDay(9, 31)],
  [HOLIDAY_TAGLINES.thanksgiving, isFourthThursdayOfNovember],
  [HOLIDAY_TAGLINES.valentines, onMonthDay(1, 14)],
  [HOLIDAY_TAGLINES.christmas, onMonthDay(11, 25)],
]);

function isTaglineActive(tagline: string, date: Date): boolean {
  const rule = HOLIDAY_RULES.get(tagline);
  if (!rule) {
    return true;
  }
  return rule(date);
}

export interface TaglineOptions {
  env?: NodeJS.ProcessEnv;
  random?: () => number;
  now?: () => Date;
  mode?: TaglineMode;
}

export function activeTaglines(options: TaglineOptions = {}): string[] {
  if (TAGLINES.length === 0) {
    return [DEFAULT_TAGLINE];
  }
  const today = options.now ? options.now() : new Date();
  const filtered = TAGLINES.filter((tagline) => isTaglineActive(tagline, today));
  return filtered.length > 0 ? filtered : TAGLINES;
}

export function pickTagline(options: TaglineOptions = {}): string {
  if (options.mode === "off") {
    return "";
  }
  if (options.mode === "default") {
    return DEFAULT_TAGLINE;
  }
  const env = options.env ?? process.env;
  const override = env?.OPENCLAW_TAGLINE_INDEX;
  if (override !== undefined) {
    const parsed = Number.parseInt(override, 10);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      const pool = TAGLINES.length > 0 ? TAGLINES : [DEFAULT_TAGLINE];
      return pool[parsed % pool.length];
    }
  }
  const pool = activeTaglines(options);
  const rand = options.random ?? Math.random;
  const index = Math.floor(rand() * pool.length) % pool.length;
  return pool[index];
}

export { TAGLINES, HOLIDAY_RULES, DEFAULT_TAGLINE };
