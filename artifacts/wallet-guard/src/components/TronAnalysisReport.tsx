import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { motion, AnimatePresence } from "framer-motion";
import { History, AlertTriangle, ArrowRightLeft, Ban, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import type { RiskyCounterparty } from "@/components/WalletAnalyzer";

interface ReportData {
  address: string;
  accountType: string;
  isFrozen: boolean;
  isInBlacklistDB: boolean;
  balanceTRX?: number;
  balanceUSDT: number;
  totalTx: number;
  txIn: number;
  txOut: number;
  dateCreated: number | null;
  lastTxDate: number;
  totalInUSDT: number;
  totalOutUSDT: number;
  uniqueWalletsCount: number;
  transfersAnalyzed: number;
  exchangeInteractions: number;
  suspiciousInteractions: number;
  riskyCounterparties: RiskyCounterparty[];
  detectedViaTRC20?: boolean;
  isInactiveAddress?: boolean;
}

const TronAnalysisReport = ({ reportData }: { reportData: ReportData }) => {
  const {
    address = "",
    accountType = "Normal",
    isFrozen = false,
    isInBlacklistDB = false,
    balanceTRX = 0,
    balanceUSDT = 0,
    totalTx = 0,
    txIn = 0,
    txOut = 0,
    dateCreated = Date.now(),
    lastTxDate = Date.now(),
    totalInUSDT = 0,
    totalOutUSDT = 0,
    uniqueWalletsCount = 0,
    transfersAnalyzed = 0,
    exchangeInteractions = 0,
    suspiciousInteractions = 0,
    riskyCounterparties = [],
    detectedViaTRC20 = false,
  } = reportData || {};

  const creationDate = dateCreated ? new Date(dateCreated) : new Date();
  const today = new Date();
  const diffTime = Math.abs(today.getTime() - creationDate.getTime());
  const daysSinceCreation = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const totalVolumeUSDT = totalInUSDT + totalOutUSDT;

  const fmtUSDT = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formattedCreationDate = creationDate.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
  const formattedLastTxDate  = new Date(lastTxDate).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
  const formattedBalance = fmtUSDT.format(balanceUSDT);
  const formattedIn      = fmtUSDT.format(totalInUSDT);
  const formattedOut     = fmtUSDT.format(totalOutUSDT);
  const formattedVolume  = fmtUSDT.format(totalVolumeUSDT);

  // ── TRES ESTADOS BASADOS EXCLUSIVAMENTE EN BLOCKCHAIN ───────────────────────
  // Riesgo REAL: solo blacklist, congelamiento o contrapartes peligrosas
  const hasRealBlockchainRisk = isInBlacklistDB || isFrozen || suspiciousInteractions > 0;

  // Señales informativas (comportamiento, NO riesgo confirmado)
  const behavioralSignals: string[] = [];
  if (totalVolumeUSDT > 1_000_000)
    behavioralSignals.push(`Volumen elevado: ${fmtUSDT.format(totalVolumeUSDT)} USDT`);
  else if (totalVolumeUSDT > 100_000)
    behavioralSignals.push(`Volumen alto: ${fmtUSDT.format(totalVolumeUSDT)} USDT`);
  if (transfersAnalyzed > 0 && exchangeInteractions === 0)
    behavioralSignals.push("Sin interacción con exchanges registrados — flujo directo entre wallets");
  if (uniqueWalletsCount > 200)
    behavioralSignals.push(`Número elevado de contrapartes únicas: ${uniqueWalletsCount}`);
  else if (uniqueWalletsCount > 50)
    behavioralSignals.push(`Contrapartes únicas: ${uniqueWalletsCount}`);
  if (daysSinceCreation < 30)
    behavioralSignals.push(`Wallet reciente: ${daysSinceCreation} días de antigüedad`);

  const showBehavioralSection = !hasRealBlockchainRisk && behavioralSignals.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-4xl mx-auto space-y-6 mt-8"
    >
      {/* ── Banner de riesgo REAL (solo blockchain) ───────────────────── */}
      <AnimatePresence>
        {hasRealBlockchainRisk && (
          <motion.div
            key="warning-banner"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.35 }}
            className="rounded-xl border-2 border-red-500 bg-red-950/60 px-5 py-4 shadow-lg shadow-red-900/20"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 p-1.5 rounded-full bg-red-500/20 shrink-0">
                <ShieldX className="h-5 w-5 text-red-400" />
              </div>
              <div className="flex-1 space-y-1.5">
                <p className="font-bold text-red-400 uppercase tracking-wider text-sm">
                  🚨 Riesgo Crítico Confirmado en Blockchain
                </p>
                <p className="text-sm text-red-300 font-medium">
                  Esta wallet tiene restricciones activas o interactuó con direcciones de alto riesgo verificadas.
                </p>
                <ul className="mt-2 space-y-0.5">
                  {isInBlacklistDB && (
                    <li className="text-xs text-red-400/80 flex items-start gap-1.5">
                      <span className="mt-0.5 shrink-0">•</span>
                      <span>Dirección en lista negra USDT (Tether).</span>
                    </li>
                  )}
                  {isFrozen && (
                    <li className="text-xs text-red-400/80 flex items-start gap-1.5">
                      <span className="mt-0.5 shrink-0">•</span>
                      <span>Wallet congelada en el contrato USDT TRC20.</span>
                    </li>
                  )}
                  {suspiciousInteractions > 0 && (
                    <li className="text-xs text-red-400/80 flex items-start gap-1.5">
                      <span className="mt-0.5 shrink-0">•</span>
                      <span>Interactuó con {suspiciousInteractions} contraparte{suspiciousInteractions > 1 ? "s" : ""} de alto riesgo confirmadas.</span>
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Estado de blockchain ───────────────────────────────────────── */}
      {isFrozen ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="rounded-xl border-2 border-red-500 bg-red-950/60 px-5 py-4 shadow-lg shadow-red-900/20"
        >
          <div className="flex items-start gap-4">
            <Ban className="h-8 w-8 shrink-0 text-red-400 mt-0.5" />
            <div className="flex-1 space-y-1">
              <p className="font-bold text-red-400 text-base tracking-wide">🚨 WALLET BLOQUEADA</p>
              <p className="text-sm text-red-300">Esta dirección está congelada por el contrato USDT.</p>
              <p className="text-sm text-red-300 font-medium">No se pueden enviar ni recibir USDT.</p>
            </div>
            <Badge variant="destructive" className="shrink-0 px-3 py-1 text-xs uppercase tracking-widest self-start">
              Congelada
            </Badge>
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="flex items-start gap-4 rounded-xl border border-green-500/30 bg-green-500/10 px-5 py-4"
        >
          <ShieldCheck className="h-7 w-7 shrink-0 text-green-400 mt-0.5" />
          <div className="flex-1 space-y-0.5">
            <p className="font-semibold text-green-300 text-sm">
              {detectedViaTRC20
                ? "✅ Wallet activa — tokens detectados en la red TRON"
                : "✅ Wallet activa"}
            </p>
            <p className="text-sm text-green-400/80">
              {detectedViaTRC20
                ? "Saldo USDT confirmado vía contrato TRC20. Sin historial de TRX."
                : "No está en la lista negra de USDT."}
            </p>
          </div>
        </motion.div>
      )}

      {/* ── Señales informativas de comportamiento (NO es riesgo) ─────── */}
      <AnimatePresence>
        {showBehavioralSection && (
          <motion.div
            key="behavioral"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-amber-500/15">
              <p className="text-sm font-semibold text-white/80">📊 Señales de comportamiento</p>
              <span className="text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-full bg-amber-500/12 border border-amber-500/30 text-amber-400">
                INFORMATIVO
              </span>
            </div>
            <div className="px-5 py-4 space-y-2">
              {behavioralSignals.map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-white/70">
                  <span className="text-amber-400 mt-0.5 shrink-0">•</span>
                  <span>{s}</span>
                </div>
              ))}
              <p className="text-[10px] text-white/35 pt-1 italic">
                Estas señales son estadísticas y no representan un riesgo confirmado en blockchain.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Red + Estado de blockchain (2 columnas) ───────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Red */}
        <Card className="rounded-xl border bg-card shadow">
          <CardHeader className="pb-2">
            <CardTitle className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
              Información de Red
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <img src="/tron-logo.png" alt="TRON" className="w-[60px] h-[60px] rounded-full object-cover shrink-0" />
              <div>
                <div className="text-2xl font-bold">Red: TRON</div>
                <div className="text-sm text-muted-foreground">USDT (TRC20)</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Estado blockchain (reemplaza el score mixto) */}
        <Card className="rounded-xl border bg-card shadow">
          <CardHeader className="pb-2">
            <CardTitle className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
              Estado en Blockchain
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { ok: !isInBlacklistDB, label: isInBlacklistDB ? "En lista negra USDT" : "Sin lista negra" },
              { ok: !isFrozen,       label: isFrozen       ? "Wallet congelada"   : "Sin congelamiento" },
              { ok: suspiciousInteractions === 0, label: suspiciousInteractions > 0 ? `${suspiciousInteractions} interacción${suspiciousInteractions > 1 ? "es" : ""} riesgosa${suspiciousInteractions > 1 ? "s" : ""}` : "Sin contrapartes riesgosas" },
            ].map(({ ok, label }) => (
              <div key={label} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${ok ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                <span>{ok ? "✅" : "❌"}</span>
                <span>{label}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ── Resumen de Actividad ───────────────────────────────────────── */}
      <Card className="rounded-xl border bg-card shadow">
        <CardHeader className="pb-2">
          <CardTitle className="font-semibold tracking-tight flex items-center gap-2 text-lg">
            <History className="w-5 h-5 text-primary" />
            Resumen de Actividad
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1 bg-background/50 p-3 rounded-lg border border-border/50">
              <span className="text-xs text-muted-foreground">Estado</span>
              {(() => {
                const active = totalTx > 0 || balanceTRX > 0 || balanceUSDT > 0;
                return (
                  <div className={`font-semibold flex items-center gap-1.5 ${active ? "text-green-500" : "text-amber-400"}`}>
                    <div className={`w-2 h-2 rounded-full ${active ? "bg-green-500 animate-pulse" : "bg-amber-400"}`} />
                    {active ? "Activo" : "Inactivo"}
                  </div>
                );
              })()}
            </div>
            <div className="space-y-1 bg-background/50 p-3 rounded-lg border border-border/50">
              <span className="text-xs text-muted-foreground">Balance Total</span>
              <div className="font-semibold text-lg">{balanceTRX.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TRX</div>
              {balanceUSDT > 0 && <div className="text-xs text-muted-foreground">{formattedBalance} USDT</div>}
            </div>
            <div className="space-y-1 bg-background/50 p-3 rounded-lg border border-border/50">
              <span className="text-xs text-muted-foreground">Wallet creada</span>
              <div className="font-medium text-sm">{formattedCreationDate}</div>
            </div>
            <div className="space-y-1 bg-background/50 p-3 rounded-lg border border-border/50">
              <span className="text-xs text-muted-foreground">Días de creada</span>
              <div className="font-medium text-sm">{daysSinceCreation} días</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="bg-background/50 p-4 rounded-lg border border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/10 text-green-500 rounded-full">
                  <ArrowRightLeft className="w-5 h-5 rotate-90" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Entradas Totales</div>
                  <div className="font-bold text-xl">{formattedIn} USDT</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium">{txIn.toLocaleString()} Transacciones</div>
              </div>
            </div>
            <div className="bg-background/50 p-4 rounded-lg border border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500/10 text-red-500 rounded-full">
                  <ArrowRightLeft className="w-5 h-5 -rotate-90" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Salidas Totales</div>
                  <div className="font-bold text-xl">{formattedOut} USDT</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium">{txOut.toLocaleString()} Transacciones</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Factores de actividad (informativos) ─────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            Datos de Actividad
            <span className="ml-auto text-xs font-normal text-muted-foreground normal-case tracking-normal">Solo informativo</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Factor</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Nivel</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Antigüedad de la Wallet</TableCell>
                  <TableCell>{daysSinceCreation} días</TableCell>
                  <TableCell>
                    <Badge variant={daysSinceCreation < 30 ? "outline" : "default"}>
                      {daysSinceCreation < 30 ? "Nueva" : daysSinceCreation <= 180 ? "Reciente" : "Establecida"}
                    </Badge>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Volumen Total USDT</TableCell>
                  <TableCell>{formattedVolume} USDT</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {totalVolumeUSDT > 1_000_000 ? "Muy Alto" : totalVolumeUSDT > 100_000 ? "Alto" : "Normal"}
                    </Badge>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Contrapartes Únicas</TableCell>
                  <TableCell>{uniqueWalletsCount}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {uniqueWalletsCount > 200 ? "Muy Alto" : uniqueWalletsCount > 50 ? "Alto" : "Normal"}
                    </Badge>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Frecuencia de Transacciones</TableCell>
                  <TableCell>{totalTx.toLocaleString()} tx</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {totalTx > 500 ? "Muy Alta" : totalTx > 100 ? "Alta" : "Normal"}
                    </Badge>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Interacción con Exchanges</TableCell>
                  <TableCell>{exchangeInteractions} de {transfersAnalyzed}</TableCell>
                  <TableCell>
                    <Badge variant="default">
                      {transfersAnalyzed > 0 ? `${Math.round((exchangeInteractions / transfersAnalyzed) * 100)}%` : "0%"}
                    </Badge>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Interacciones con Riesgo Confirmado</TableCell>
                  <TableCell>{suspiciousInteractions} de {transfersAnalyzed}</TableCell>
                  <TableCell>
                    <Badge variant={suspiciousInteractions >= 1 ? "destructive" : "default"}>
                      {suspiciousInteractions >= 5
                        ? "Riesgo Crítico"
                        : suspiciousInteractions >= 1
                        ? "Riesgo Confirmado"
                        : "Sin riesgo"}
                    </Badge>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Congelamientos y Sanciones ────────────────────────────────── */}
      <Card className="border-red-500/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg text-red-500">
            <Ban className="w-5 h-5" />
            Congelamientos y Sanciones
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Fecha de Operación</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isFrozen && (
                  <TableRow>
                    <TableCell className="font-medium text-red-500">USDT Blacklist / Congelada</TableCell>
                    <TableCell>{formattedLastTxDate}</TableCell>
                    <TableCell><Badge variant="destructive">Congelada</Badge></TableCell>
                  </TableRow>
                )}
                {isInBlacklistDB && !isFrozen && (
                  <TableRow>
                    <TableCell className="font-medium text-red-500">Lista negra USDT (Tether)</TableCell>
                    <TableCell>Verificado</TableCell>
                    <TableCell><Badge variant="destructive">Restringida</Badge></TableCell>
                  </TableRow>
                )}
                {suspiciousInteractions > 0 && (
                  <TableRow>
                    <TableCell className="font-medium text-orange-500">Contrapartes Peligrosas</TableCell>
                    <TableCell>{suspiciousInteractions} interacción{suspiciousInteractions > 1 ? "es" : ""} detectada{suspiciousInteractions > 1 ? "s" : ""}</TableCell>
                    <TableCell>
                      <Badge variant={suspiciousInteractions >= 5 ? "destructive" : "outline"}>
                        {suspiciousInteractions >= 5 ? "Riesgo Crítico" : "Riesgo Confirmado"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )}
                {!isFrozen && !isInBlacklistDB && suspiciousInteractions === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-4">
                      No se encontraron sanciones ni congelamientos para esta dirección.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Contrapartes de Riesgo ────────────────────────────────────── */}
      <Card className="border-orange-500/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg text-orange-400">
            <ShieldX className="w-5 h-5" />
            Contrapartes de Riesgo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Nivel de Riesgo</TableHead>
                  <TableHead>Dirección Contraparte</TableHead>
                  <TableHead>Valor Transacción</TableHead>
                  <TableHead>Etiqueta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {riskyCounterparties.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                      No se detectaron contrapartes de riesgo en los últimos 150 movimientos.
                    </TableCell>
                  </TableRow>
                ) : (
                  riskyCounterparties.map((r, i) => {
                    const levelLabel = r.level === "critical" ? "Crítico" : r.level === "high" ? "Alto" : "Moderado";
                    const levelColor = r.level === "critical" ? "text-red-500" : r.level === "high" ? "text-orange-400" : "text-yellow-400";
                    const valueColor = r.value >= 0 ? "text-green-400" : "text-red-400";
                    const formattedValue = (r.value >= 0 ? "+" : "") + r.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " USDT";
                    return (
                      <TableRow key={i}>
                        <TableCell><span className={`font-semibold text-sm ${levelColor}`}>{levelLabel}</span></TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{r.address.slice(0, 8)}…{r.address.slice(-6)}</TableCell>
                        <TableCell className={`font-medium tabular-nums ${valueColor}`}>{formattedValue}</TableCell>
                        <TableCell>
                          <Badge
                            variant={r.level === "critical" ? "destructive" : "outline"}
                            className={r.level === "high" ? "border-orange-500 text-orange-400" : r.level === "medium" ? "border-yellow-500 text-yellow-400" : ""}
                          >
                            {r.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Dirección + tipo de cuenta ────────────────────────────────── */}
      <div className="bg-muted/30 p-4 rounded-lg border border-border/50 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
        <div className="space-y-1 flex-1">
          <p className="text-xs text-muted-foreground font-mono break-all">{address}</p>
          <p className="text-xs text-muted-foreground">
            Tipo de cuenta: <span className="text-foreground font-medium">{accountType}</span>
            {" · "}Última transacción: <span className="text-foreground font-medium">{formattedLastTxDate}</span>
            {" · "}Contrapartes: <span className="text-foreground font-medium">{uniqueWalletsCount}</span>
          </p>
        </div>
      </div>

      {/* ── Aviso Legal ───────────────────────────────────────────────── */}
      <div className="bg-muted/30 p-4 rounded-lg border border-border/50 mb-12 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Aviso Legal:</strong> La información proporcionada en
          este informe es generada a partir de datos on-chain y bases de datos públicas de terceros.
          CoinCashWalletGuard no garantiza la exactitud absoluta, integridad o actualidad de los
          datos. Esta información tiene fines puramente analíticos e informativos, y no constituye
          asesoramiento financiero, legal ni recomendación de inversión. El usuario asume toda la
          responsabilidad por las decisiones tomadas en base a este análisis. En caso de dudas sobre
          la legalidad de los fondos, consulte con un profesional legal o las autoridades
          competentes.
        </p>
      </div>
    </motion.div>
  );
};

export default TronAnalysisReport;
