import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  senviokBaseUrl: (process.env.SENVIOK_BASE_URL || "https://api.senviok.live/v1").replace(/\/+$/, ""),
  defaultApiKey: process.env.SENVIOK_API_KEY || "",
};
