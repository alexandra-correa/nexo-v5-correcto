
import React, { useState } from "react";
import { supabase } from "./supabase";
import { Mail, Lock, ArrowRight, Loader2 } from "lucide-react";

export default function Auth({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { data, error: loginError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (loginError) throw loginError;

      onLogin?.(data.user);
    } catch (err) {
      setError(err.message || "No se pudo iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#090d18] flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-[#111827] p-8 shadow-2xl">
        <div className="mb-8">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white text-xl font-bold">
            N
          </div>

          <h1 className="text-3xl font-bold text-white tracking-tight">
            NEXO
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            Gestión inteligente para restaurantes
          </p>
        </div>

        <h2 className="text-xl font-semibold text-white">
          Iniciar sesión
        </h2>

        <p className="mt-1 mb-6 text-sm text-slate-400">
          Ingresa con tu cuenta de administrador.
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm text-slate-300">
              Correo electrónico
            </label>
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#0b1220] px-4">
              <Mail size={18} className="text-slate-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                className="w-full bg-transparent py-3 text-white outline-none placeholder:text-slate-600"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm text-slate-300">
              Contraseña
            </label>
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#0b1220] px-4">
              <Lock size={18} className="text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tu contraseña"
                className="w-full bg-transparent py-3 text-white outline-none placeholder:text-slate-600"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Ingresando...
              </>
            ) : (
              <>
                Entrar a NEXO
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-slate-500">
          NEXO · Plataforma de gestión para restaurantes
        </p>
      </section>
    </main>
  );
}
