import { dashboardApiKey } from "@utils/config";
import { Request, Response, NextFunction } from "express";

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
    const apiKey = req.headers["x-api-key"];

    if (!apiKey || apiKey !== dashboardApiKey) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    next();
}