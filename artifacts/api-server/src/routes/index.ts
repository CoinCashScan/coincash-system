import { Router, type IRouter } from "express";
import healthRouter from "./health";
import blacklistRouter from "./blacklist";
import relayRouter from "./relay";
import bitraceProxyRouter from "./bitraceProxy";
import riskAnalysisRouter from "./riskAnalysis";

const router: IRouter = Router();

router.use(healthRouter);
router.use(blacklistRouter);
router.use(relayRouter);
router.use(bitraceProxyRouter);
router.use(riskAnalysisRouter);

export default router;
