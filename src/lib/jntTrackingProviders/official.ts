import type { JntTrackLookupResult, JntTrackingProvider } from "@/lib/jntTrackingProviders/types";
import { mapJntStatusCode, mapJntStatusLabel } from "@/lib/jntTrackingStatusMap";

const API_URL = "https://ylofficialjw.jtexpress.ph/website/track/query";
const TRACK_PAGE = "https://www.jtexpress.ph/track-and-trace";
const CAPTCHA_APP_ID = (process.env.JNT_TENCENT_CAPTCHA_APP_ID ?? "189995772").trim();

type CaptchaTokens = { verify: string; vck: string };

type JntApiRow = {
  statuscode?: string | number;
  labelName?: string;
  details?: Array<{ scanstatus?: string; scanscode?: string }>;
};

async function solveTencentCaptcha(): Promise<CaptchaTokens> {
  const apiKey = (process.env.TWOCAPTCHA_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error(
      "Official J&T API requires Tencent captcha. Set TWOCAPTCHA_API_KEY or use TRACKINGMORE_API_KEY instead.",
    );
  }

  const createRes = await fetch("https://api.2captcha.com/createTask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientKey: apiKey,
      task: {
        type: "TencentTaskProxyless",
        websiteURL: TRACK_PAGE,
        appId: CAPTCHA_APP_ID,
      },
    }),
  });
  const createJson = (await createRes.json()) as {
    errorId?: number;
    taskId?: string;
    errorDescription?: string;
  };
  if (createJson.errorId !== 0 || !createJson.taskId) {
    throw new Error(createJson.errorDescription ?? "2captcha createTask failed.");
  }

  const taskId = createJson.taskId;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const pollRes = await fetch("https://api.2captcha.com/getTaskResult", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientKey: apiKey, taskId }),
    });
    const pollJson = (await pollRes.json()) as {
      errorId?: number;
      status?: string;
      solution?: { ticket?: string; randstr?: string };
      errorDescription?: string;
    };
    if (pollJson.errorId !== 0) {
      throw new Error(pollJson.errorDescription ?? "2captcha getTaskResult failed.");
    }
    if (pollJson.status === "ready" && pollJson.solution?.ticket && pollJson.solution?.randstr) {
      return { verify: pollJson.solution.ticket, vck: pollJson.solution.randstr };
    }
  }
  throw new Error("2captcha timed out waiting for Tencent captcha solution.");
}

async function getCaptchaTokens(): Promise<CaptchaTokens> {
  const verify = (process.env.JNT_TRACKING_VERIFY ?? "").trim();
  const vck = (process.env.JNT_TRACKING_VCK ?? "").trim();
  if (verify && vck) return { verify, vck };
  return solveTencentCaptcha();
}

let cachedCaptcha: { tokens: CaptchaTokens; at: number } | null = null;

async function captchaForRequest(): Promise<CaptchaTokens> {
  const now = Date.now();
  if (cachedCaptcha && now - cachedCaptcha.at < 90_000) return cachedCaptcha.tokens;
  const tokens = await getCaptchaTokens();
  cachedCaptcha = { tokens, at: now };
  return tokens;
}

async function queryBatch(billCodes: string, captcha: CaptchaTokens): Promise<JntApiRow[]> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: "https://www.jtexpress.ph",
      Referer: TRACK_PAGE,
    },
    body: JSON.stringify({
      billCodes,
      verify: captcha.verify,
      vck: captcha.vck,
    }),
  });
  const json = (await res.json()) as {
    succ?: boolean;
    fail?: boolean;
    msg?: string;
    data?: JntApiRow[];
  };
  if (!json.succ || !Array.isArray(json.data)) {
    throw new Error(json.msg ?? "J&T track query failed.");
  }
  return json.data;
}

function resultFromRow(waybillNumber: string, row: JntApiRow | undefined): JntTrackLookupResult {
  if (!row) {
    return { waybillNumber, ok: false, error: "Waybill not found in J&T response." };
  }
  const code = String(row.statuscode ?? "").trim();
  const lastScan = row.details?.filter((d) => d.scanscode).slice(-1)[0];
  const scanLabel = (lastScan?.scanstatus ?? "").trim();
  const labelName = (row.labelName ?? "").trim();
  const carrierStatusLabel = scanLabel || labelName || code;
  const bookingStatus =
    mapJntStatusCode(code) ?? mapJntStatusLabel(carrierStatusLabel) ?? mapJntStatusLabel(labelName) ?? undefined;
  return {
    waybillNumber,
    ok: true,
    carrierStatusLabel,
    bookingStatus,
    rawStatusCode: code,
  };
}

export function createOfficialJntProvider(): JntTrackingProvider | null {
  if (process.env.JNT_TRACKING_OFFICIAL_DISABLED === "1") return null;
  return {
    name: "official",
    async lookupWaybills(waybills: string[]): Promise<JntTrackLookupResult[]> {
      const results: JntTrackLookupResult[] = [];
      for (let i = 0; i < waybills.length; i += 10) {
        const batch = waybills.slice(i, i + 10);
        const billCodes = batch.join(",");
        try {
          let rows: JntApiRow[];
          try {
            rows = await queryBatch(billCodes, await captchaForRequest());
          } catch (firstErr) {
            cachedCaptcha = null;
            rows = await queryBatch(billCodes, await captchaForRequest());
            void firstErr;
          }
          for (let j = 0; j < batch.length; j++) {
            results.push(resultFromRow(batch[j]!, rows[j]));
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          for (const wb of batch) {
            results.push({ waybillNumber: wb, ok: false, error: msg });
          }
        }
      }
      return results;
    },
  };
}
