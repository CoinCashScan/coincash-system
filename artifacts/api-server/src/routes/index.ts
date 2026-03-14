import { Router, type IRouter } from "express";
import healthRouter from "./health";
import blacklistRouter from "./blacklist";

const router: IRouter = Router();

router.use(healthRouter);
router.use(blacklistRouter);

export default router;
