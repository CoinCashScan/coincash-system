import { Router, type IRouter } from "express";
import healthRouter from "./health";
import blacklistRouter from "./blacklist";
import relayRouter from "./relay";

const router: IRouter = Router();

router.use(healthRouter);
router.use(blacklistRouter);
router.use(relayRouter);

export default router;
