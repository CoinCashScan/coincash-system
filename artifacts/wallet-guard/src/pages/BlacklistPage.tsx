import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Ban, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Link } from "wouter";

interface BlacklistedEntry {
  id: number;
  address: string;
  chain: string;
  riskLevel: string;
  freezeBalance: string;
  freezeTime: number;
}

const API_URL = "/api-server/api/blacklist";

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortAddress(addr: string): string {
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

export default function BlacklistPage() {
  const [entries, setEntries] = useState<BlacklistedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: BlacklistedEntry[] = await res.json();
      setEntries(data);
      setLastUpdated(new Date());
    } catch (e: any) {
      setError("No se pudo cargar la lista. Verificando conexión…");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border/50 bg-card/30 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <span className="text-xl font-extrabold cursor-pointer hover:opacity-80 transition-opacity">
                Coin<span className="text-primary">Cash</span>
              </span>
            </Link>
            <span className="text-border/80">|</span>
            <div className="flex items-center gap-2">
              <Ban className="w-4 h-4 text-red-500" />
              <span className="font-semibold text-sm" style={{ color: "rgb(31, 189, 20)" }}>
                WalletGuard
              </span>
              <span className="text-muted-foreground text-sm">/ Blacklist</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-muted-foreground hidden sm:block">
                Actualizado: {lastUpdated.toLocaleTimeString("es-ES")}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchData(true)}
              disabled={refreshing || loading}
              className="h-8 px-3 text-xs gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Title Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card className="border-red-500/20 bg-red-500/5">
            <CardContent className="py-5 flex items-center gap-4">
              <div className="p-3 rounded-full bg-red-500/10">
                <Ban className="w-6 h-6 text-red-500" />
              </div>
              <div className="flex-1">
                <h1 className="text-lg font-bold text-red-400">
                  Monitor de Direcciones Congeladas — USDT TRC20
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Monitoreo en tiempo real del contrato USDT (TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t) · Actualización automática cada 2 minutos
                </p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-2xl font-bold text-red-400">{entries.length}</div>
                <div className="text-xs text-muted-foreground">registros</div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Table Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="w-5 h-5 text-red-500" />
                Últimas 100 Direcciones Congeladas
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Cargando desde la blockchain…</span>
                </div>
              ) : error ? (
                <div className="flex items-center justify-center py-16 text-red-400 gap-2 px-4 text-center text-sm">
                  <Ban className="w-5 h-5 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : entries.length === 0 ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
                  No se encontraron direcciones congeladas aún.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead className="pl-6">Dirección</TableHead>
                        <TableHead>Red</TableHead>
                        <TableHead>Nivel de Riesgo</TableHead>
                        <TableHead className="text-right">Balance Congelado</TableHead>
                        <TableHead className="pr-6">Fecha de Congelamiento</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map((entry) => (
                        <TableRow key={entry.id} className="hover:bg-muted/20 transition-colors">
                          <TableCell className="pl-6">
                            <div className="font-mono text-xs text-muted-foreground">
                              <span className="hidden sm:inline">{entry.address}</span>
                              <span className="sm:hidden">{shortAddress(entry.address)}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs font-medium">
                              {entry.chain}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="destructive"
                              className="text-xs uppercase tracking-wider"
                            >
                              {entry.riskLevel}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={`font-mono text-sm font-medium ${parseFloat(entry.freezeBalance) > 0 ? "text-red-400" : "text-muted-foreground"}`}>
                              {parseFloat(entry.freezeBalance) > 0
                                ? parseFloat(entry.freezeBalance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " USDT"
                                : "—"}
                            </span>
                          </TableCell>
                          <TableCell className="pr-6 text-sm text-muted-foreground">
                            {formatDate(entry.freezeTime)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Legal Footer */}
        <div className="bg-muted/20 p-4 rounded-lg border border-border/30 flex items-start gap-3">
          <ShieldAlert className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Aviso Legal:</strong> Este monitor detecta eventos{" "}
            <em>AddedBlackList</em> emitidos por el contrato oficial USDT TRC20 en la red TRON.
            La información es de carácter informativo y no constituye asesoramiento financiero ni legal.
          </p>
        </div>
      </div>
    </div>
  );
}
