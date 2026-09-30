"use client";

import { useEffect, useState } from "react";

type User = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  hospitalId?: string | null;
};

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
  user: User;
};

type Appointment = {
  id: string;
  startsAt: string;
  status:
    | "PENDING"
    | "CONFIRMED"
    | "IN_PROGRESS"
    | "COMPLETED"
    | "CANCELLED"
    | "NO_SHOW";
  doctor: { user: { fullName: string } };
  patient: { user: { fullName: string } };
  department: { name: string };
};

type DoctorOption = {
  id: string;
  specialisation: string;
  user: { fullName: string };
  department: { name: string };
};

type PatientOption = {
  id: string;
  mrn: string;
  user: { fullName: string };
};

type AppointmentSlot = {
  start: string;
  available: boolean;
};

type ClinicalNoteDraft = {
  chiefComplaint: string;
  symptoms: string;
  diagnosis: string;
  treatmentPlan: string;
  notes: string;
  bpSystolic: string;
  bpDiastolic: string;
  pulse: string;
  temperatureC: string;
  spo2: string;
  heightCm: string;
  weightKg: string;
};

type DashboardAnalytics = {
  totalPatients: number;
  appointmentsToday: number;
  revenue: number;
  occupiedBeds: number;
  totalBeds: number;
};

type ApiEnvelope<T> = {
  data: T;
  message?: string;
};

function unwrapApiData<T>(result: T | ApiEnvelope<T>): T {
  if (result !== null && typeof result === "object" && "data" in result) {
    return (result as ApiEnvelope<T>).data;
  }
  return result as T;
}

const STORAGE_KEY = "medcore-auth";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const ANALYTICS_ROLES = [
  "SUPER_ADMIN",
  "HOSPITAL_ADMIN",
  "ACCOUNTANT",
  "DOCTOR",
];
const APPOINTMENT_STATUS_ROLES = [
  "SUPER_ADMIN",
  "HOSPITAL_ADMIN",
  "DOCTOR",
  "NURSE",
  "RECEPTIONIST",
];
const APPOINTMENT_BOOKING_ROLES = [
  "SUPER_ADMIN",
  "HOSPITAL_ADMIN",
  "RECEPTIONIST",
  "PATIENT",
];
const CLINICAL_NOTE_ROLES = ["DOCTOR", "NURSE", "SUPER_ADMIN"];
const EMPTY_CLINICAL_NOTE: ClinicalNoteDraft = {
  chiefComplaint: "",
  symptoms: "",
  diagnosis: "",
  treatmentPlan: "",
  notes: "",
  bpSystolic: "",
  bpDiastolic: "",
  pulse: "",
  temperatureC: "",
  spo2: "",
  heightCm: "",
  weightKg: "",
};

function getStoredAccessToken() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? (JSON.parse(saved) as AuthResponse).accessToken : "";
  } catch {
    return "";
  }
}

function getAppointmentActions(status: Appointment["status"]) {
  if (status === "PENDING") {
    return [
      { label: "Confirm", status: "CONFIRMED" as const },
      { label: "Cancel", status: "CANCELLED" as const },
    ];
  }
  if (status === "CONFIRMED") {
    return [
      { label: "Start", status: "IN_PROGRESS" as const },
      { label: "No-show", status: "NO_SHOW" as const },
      { label: "Cancel", status: "CANCELLED" as const },
    ];
  }
  if (status === "IN_PROGRESS") {
    return [{ label: "Complete", status: "COMPLETED" as const }];
  }
  return [];
}

export default function Home() {
  const [email, setEmail] = useState("admin@medcore.local");
  const [password, setPassword] = useState("MedCore@123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [dashboardRefresh, setDashboardRefresh] = useState(0);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState("");
  const [appointmentActionError, setAppointmentActionError] = useState("");
  const [updatingAppointmentId, setUpdatingAppointmentId] = useState<
    string | null
  >(null);
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [bookingOptionsLoading, setBookingOptionsLoading] = useState(false);
  const [bookingOptionsError, setBookingOptionsError] = useState("");
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [appointmentDate, setAppointmentDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [availableSlots, setAvailableSlots] = useState<AppointmentSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [slotRefresh, setSlotRefresh] = useState(0);
  const [appointmentReason, setAppointmentReason] = useState("");
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [bookingSuccess, setBookingSuccess] = useState("");
  const [editingClinicalNoteFor, setEditingClinicalNoteFor] = useState<
    string | null
  >(null);
  const [clinicalNoteDraft, setClinicalNoteDraft] =
    useState<ClinicalNoteDraft>(EMPTY_CLINICAL_NOTE);
  const [clinicalNoteSubmitting, setClinicalNoteSubmitting] = useState(false);
  const [clinicalNoteError, setClinicalNoteError] = useState("");
  const [clinicalNoteSavedFor, setClinicalNoteSavedFor] = useState<
    string | null
  >(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as AuthResponse;
      if (parsed?.user) {
        setUser(parsed.user);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setAppointments([]);
      setAnalytics(null);
      return;
    }

    let cancelled = false;
    const canViewAnalytics = ANALYTICS_ROLES.includes(user.role);

    const loadDashboard = async () => {
      setAppointmentsLoading(true);
      setAppointmentsError("");
      setAnalytics(null);
      setAnalyticsError("");
      setAnalyticsLoading(canViewAnalytics);

      let accessToken = "";
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        accessToken = saved
          ? (JSON.parse(saved) as AuthResponse).accessToken
          : "";
      } catch {
        if (!cancelled)
          setAppointmentsError("Please sign in again to load dashboard data.");
      }

      if (!accessToken) {
        if (!cancelled) {
          setAppointmentsLoading(false);
          setAnalyticsLoading(false);
          setAppointmentsError("Please sign in again to load dashboard data.");
        }
        return;
      }

      const headers = { Authorization: `Bearer ${accessToken}` };
      const today = new Date().toISOString().slice(0, 10);
      const appointmentsRequest = fetch(
        `${API_URL}/appointments?date=${today}`,
        { headers },
      ).then(async (response) => {
        const result = (await response.json()) as ApiEnvelope<Appointment[]>;
        if (!response.ok)
          throw new Error(result.message ?? "Unable to load appointments.");
        return unwrapApiData(result);
      });
      const analyticsRequest = canViewAnalytics
        ? fetch(`${API_URL}/analytics/revenue`, { headers }).then(
            async (response) => {
              const result =
                (await response.json()) as ApiEnvelope<DashboardAnalytics>;
              if (!response.ok)
                throw new Error(result.message ?? "Unable to load metrics.");
              return unwrapApiData(result);
            },
          )
        : Promise.resolve(null);

      const [appointmentResult, analyticsResult] = await Promise.allSettled([
        appointmentsRequest,
        analyticsRequest,
      ]);

      if (cancelled) return;

      if (appointmentResult.status === "fulfilled") {
        setAppointments(appointmentResult.value);
      } else {
        setAppointmentsError(
          appointmentResult.reason instanceof Error
            ? appointmentResult.reason.message
            : "Unable to load appointments.",
        );
      }

      if (analyticsResult.status === "fulfilled") {
        setAnalytics(analyticsResult.value);
      } else {
        setAnalyticsError(
          analyticsResult.reason instanceof Error
            ? analyticsResult.reason.message
            : "Unable to load metrics.",
        );
      }

      setAppointmentsLoading(false);
      setAnalyticsLoading(false);
    };

    void loadDashboard();
    return () => {
      cancelled = true;
    };
  }, [user, dashboardRefresh]);

  useEffect(() => {
    if (!user || !APPOINTMENT_BOOKING_ROLES.includes(user.role)) {
      setDoctors([]);
      setPatients([]);
      return;
    }

    let cancelled = false;
    const loadBookingOptions = async () => {
      setBookingOptionsLoading(true);
      setBookingOptionsError("");
      try {
        if (user.role !== "SUPER_ADMIN" && !user.hospitalId) {
          throw new Error("Your account is not assigned to a hospital.");
        }
        const accessToken = getStoredAccessToken();
        if (!accessToken) throw new Error("Please sign in again to book.");

        const hospitalQuery = user.hospitalId
          ? `?hospitalId=${encodeURIComponent(user.hospitalId)}`
          : "";
        const headers = { Authorization: `Bearer ${accessToken}` };
        const doctorResponse = await fetch(
          `${API_URL}/doctors${hospitalQuery}`,
          { headers },
        );
        const doctorResult = (await doctorResponse.json()) as ApiEnvelope<
          DoctorOption[]
        >;
        if (!doctorResponse.ok)
          throw new Error(doctorResult.message ?? "Unable to load doctors.");

        let patientOptions: PatientOption[] = [];
        if (user.role !== "PATIENT") {
          const patientResponse = await fetch(`${API_URL}/patients`, {
            headers,
          });
          const patientResult = (await patientResponse.json()) as ApiEnvelope<
            PatientOption[]
          >;
          if (!patientResponse.ok)
            throw new Error(
              patientResult.message ?? "Unable to load patients.",
            );
          patientOptions = unwrapApiData(patientResult);
        }

        if (!cancelled) {
          setDoctors(unwrapApiData(doctorResult));
          setPatients(patientOptions);
        }
      } catch (err) {
        if (!cancelled) {
          setBookingOptionsError(
            err instanceof Error
              ? err.message
              : "Unable to load booking options.",
          );
        }
      } finally {
        if (!cancelled) setBookingOptionsLoading(false);
      }
    };

    void loadBookingOptions();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user || !selectedDoctorId || !appointmentDate) {
      setAvailableSlots([]);
      setSelectedSlot("");
      return;
    }

    let cancelled = false;
    const loadSlots = async () => {
      setSlotsLoading(true);
      setSlotsError("");
      setAvailableSlots([]);
      setSelectedSlot("");
      try {
        const accessToken = getStoredAccessToken();
        if (!accessToken)
          throw new Error("Please sign in again to view slots.");
        const response = await fetch(
          `${API_URL}/doctors/${selectedDoctorId}/slots?date=${encodeURIComponent(appointmentDate)}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const result = (await response.json()) as ApiEnvelope<
          AppointmentSlot[]
        >;
        if (!response.ok)
          throw new Error(result.message ?? "Unable to load available times.");
        const now = Date.now();
        const slots = unwrapApiData(result).filter(
          (slot) => slot.available && new Date(slot.start).getTime() > now,
        );
        if (!cancelled) setAvailableSlots(slots);
      } catch (err) {
        if (!cancelled) {
          setSlotsError(
            err instanceof Error
              ? err.message
              : "Unable to load available times.",
          );
        }
      } finally {
        if (!cancelled) setSlotsLoading(false);
      }
    };

    void loadSlots();
    return () => {
      cancelled = true;
    };
  }, [user, selectedDoctorId, appointmentDate, slotRefresh]);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const data = (await response.json()) as {
        message?: string;
        user?: User;
        accessToken?: string;
        refreshToken?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.message ?? "Login failed. Please check your credentials.",
        );
      }

      if (!data.user) {
        throw new Error("Login response was missing user data.");
      }

      const authData: AuthResponse = {
        accessToken: data.accessToken ?? "",
        refreshToken: data.refreshToken ?? "",
        deviceId: "web-client",
        user: data.user,
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(authData));
      setUser(data.user);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to connect to the API server.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  };

  const updateAppointmentStatus = async (
    appointmentId: string,
    status: Appointment["status"],
  ) => {
    setUpdatingAppointmentId(appointmentId);
    setAppointmentActionError("");

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const accessToken = saved
        ? (JSON.parse(saved) as AuthResponse).accessToken
        : "";
      if (!accessToken)
        throw new Error("Please sign in again to update appointments.");

      const response = await fetch(
        `${API_URL}/appointments/${appointmentId}/status`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status }),
        },
      );
      const result = (await response.json()) as ApiEnvelope<Appointment>;
      if (!response.ok)
        throw new Error(result.message ?? "Unable to update appointment.");

      setAppointments((current) =>
        current.map((appointment) =>
          appointment.id === appointmentId
            ? {
                ...appointment,
                status: unwrapApiData(result).status,
              }
            : appointment,
        ),
      );
    } catch (err) {
      setAppointmentActionError(
        err instanceof Error ? err.message : "Unable to update appointment.",
      );
    } finally {
      setUpdatingAppointmentId(null);
    }
  };

  const handleBookAppointment = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!selectedDoctorId || !selectedSlot) return;
    setBookingSubmitting(true);
    setBookingError("");
    setBookingSuccess("");

    try {
      const accessToken = getStoredAccessToken();
      if (!accessToken) throw new Error("Please sign in again to book.");
      if (user?.role !== "PATIENT" && !selectedPatientId) {
        throw new Error("Select a patient before booking.");
      }

      const body: {
        doctorId: string;
        startsAt: string;
        reason?: string;
        patientId?: string;
      } = {
        doctorId: selectedDoctorId,
        startsAt: selectedSlot,
        ...(appointmentReason.trim()
          ? { reason: appointmentReason.trim() }
          : {}),
        ...(user?.role !== "PATIENT" ? { patientId: selectedPatientId } : {}),
      };
      const response = await fetch(`${API_URL}/appointments`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as ApiEnvelope<Appointment>;
      if (!response.ok)
        throw new Error(result.message ?? "Unable to book this appointment.");

      setBookingSuccess("Appointment request submitted.");
      setSelectedSlot("");
      setAppointmentReason("");
      setSlotRefresh((current) => current + 1);
      setDashboardRefresh((current) => current + 1);
    } catch (err) {
      setBookingError(
        err instanceof Error ? err.message : "Unable to book this appointment.",
      );
    } finally {
      setBookingSubmitting(false);
    }
  };

  const handleClinicalNoteSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
    appointmentId: string,
  ) => {
    event.preventDefault();
    setClinicalNoteSubmitting(true);
    setClinicalNoteError("");

    try {
      const accessToken = getStoredAccessToken();
      if (!accessToken)
        throw new Error("Please sign in again to save the note.");
      if (!Object.values(clinicalNoteDraft).some((value) => value.trim())) {
        throw new Error("Enter at least one clinical detail before saving.");
      }

      const payload: Record<string, string | number> = { appointmentId };
      const textFields = [
        "chiefComplaint",
        "symptoms",
        "diagnosis",
        "treatmentPlan",
        "notes",
      ] as const;
      for (const field of textFields) {
        const value = clinicalNoteDraft[field].trim();
        if (value) payload[field] = value;
      }

      const numericFields = [
        "bpSystolic",
        "bpDiastolic",
        "pulse",
        "temperatureC",
        "spo2",
        "heightCm",
        "weightKg",
      ] as const;
      for (const field of numericFields) {
        const value = clinicalNoteDraft[field].trim();
        if (value) {
          const number = Number(value);
          if (!Number.isFinite(number))
            throw new Error("Vitals must contain valid numbers.");
          payload[field] = number;
        }
      }

      const response = await fetch(`${API_URL}/medical-records`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as ApiEnvelope<{ id: string }>;
      if (!response.ok)
        throw new Error(result.message ?? "Unable to save the clinical note.");

      setClinicalNoteSavedFor(appointmentId);
      setClinicalNoteDraft(EMPTY_CLINICAL_NOTE);
      setEditingClinicalNoteFor(null);
    } catch (err) {
      setClinicalNoteError(
        err instanceof Error
          ? err.message
          : "Unable to save the clinical note.",
      );
    } finally {
      setClinicalNoteSubmitting(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);

  const appointmentMetric = {
    label:
      user?.role === "PATIENT" || user?.role === "DOCTOR"
        ? "Your appointments today"
        : "Appointments today",
    value: appointmentsLoading
      ? "Loading..."
      : appointmentsError
        ? "—"
        : String(appointments.length),
  };
  const dashboardMetrics = analytics
    ? [
        { label: "Patients", value: String(analytics.totalPatients) },
        {
          label: "Appointments today",
          value: String(analytics.appointmentsToday),
        },
        {
          label: "Occupied beds",
          value: `${analytics.occupiedBeds} / ${analytics.totalBeds}`,
        },
        {
          label: "Paid revenue (7d)",
          value: formatCurrency(analytics.revenue),
        },
      ]
    : analyticsLoading
      ? [
          "Patients",
          "Appointments today",
          "Occupied beds",
          "Paid revenue (7d)",
        ].map((label) => ({ label, value: "Loading..." }))
      : [appointmentMetric];

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-6 py-12">
        {!user ? (
          <div className="grid w-full max-w-6xl overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/80 shadow-2xl shadow-cyan-950/30 lg:grid-cols-[1.2fr_0.8fr]">
            <section className="relative overflow-hidden bg-linear-to-br from-sky-600 via-cyan-700 to-indigo-900 p-8 md:p-12">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.25),transparent_35%)]" />
              <div className="relative z-10">
                <div className="mb-8 inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-sky-100">
                  MedCore HMS
                </div>
                <h1 className="max-w-md text-4xl font-bold tracking-tight md:text-5xl">
                  Smarter hospital operations for every patient touchpoint.
                </h1>
                <p className="mt-5 max-w-lg text-sm text-sky-100/90 md:text-base">
                  Coordinate admissions, clinical records, appointments,
                  billing, and pharmacy workflows from one secure command
                  center.
                </p>

                <div className="mt-10 grid gap-4 sm:grid-cols-3">
                  {[
                    ["24/7", "care coverage"],
                    ["98.4%", "task completion"],
                    ["1.2k+", "patients tracked"],
                  ].map(([value, label]) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm"
                    >
                      <div className="text-2xl font-bold">{value}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.15em] text-sky-100/80">
                        {label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="p-8 md:p-12">
              <div className="mb-8">
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-400">
                  Welcome back
                </p>
                <h2 className="mt-2 text-3xl font-bold text-white">Sign in</h2>
              </div>

              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-200">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none ring-0 transition focus:border-cyan-500"
                    placeholder="name@medcore.com"
                    required
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-200">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-500"
                    placeholder="••••••••"
                    required
                  />
                </div>

                {error ? (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Signing in..." : "Continue to dashboard"}
                </button>
              </form>

              <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-300">
                <p className="font-medium text-slate-100">Demo access</p>
                <p className="mt-2">
                  Use your API user or register a patient account first.
                </p>
              </div>
            </section>
          </div>
        ) : (
          <div className="w-full max-w-6xl rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-cyan-950/20">
            <div className="flex flex-col gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-cyan-400">
                  MedCore HMS
                </p>
                <h1 className="mt-2 text-3xl font-bold text-white">
                  Operations dashboard
                </h1>
              </div>
              <button
                onClick={handleLogout}
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-medium text-slate-100 hover:border-slate-500"
              >
                Logout
              </button>
            </div>

            <div
              className={`mt-6 grid gap-4 ${dashboardMetrics.length === 1 ? "max-w-sm" : "md:grid-cols-4"}`}
            >
              {dashboardMetrics.map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded-2xl border border-slate-800 bg-slate-950 p-5"
                >
                  <div className="text-sm text-slate-400">{label}</div>
                  <div className="mt-3 wrap-break-word text-2xl font-bold leading-tight text-white md:text-3xl">
                    {value}
                  </div>
                </div>
              ))}
            </div>
            {analyticsError ? (
              <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                Dashboard metrics unavailable: {analyticsError}
              </p>
            ) : null}

            {APPOINTMENT_BOOKING_ROLES.includes(user.role) ? (
              <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-950 p-5">
                <div className="mb-5">
                  <h2 className="text-lg font-semibold text-white">
                    Book an appointment
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Choose a clinician and an available time.
                  </p>
                </div>

                {bookingOptionsError ? (
                  <p className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                    {bookingOptionsError}
                  </p>
                ) : null}
                {bookingError ? (
                  <p className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                    {bookingError}
                  </p>
                ) : null}
                {bookingSuccess ? (
                  <p className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                    {bookingSuccess}
                  </p>
                ) : null}

                <form
                  onSubmit={handleBookAppointment}
                  className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"
                >
                  <label className="text-sm text-slate-300">
                    Date
                    <input
                      type="date"
                      min={new Date().toISOString().slice(0, 10)}
                      value={appointmentDate}
                      onChange={(event) =>
                        setAppointmentDate(event.target.value)
                      }
                      required
                      className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-white outline-none focus:border-cyan-500"
                    />
                  </label>
                  <label className="text-sm text-slate-300">
                    Doctor
                    <select
                      value={selectedDoctorId}
                      onChange={(event) =>
                        setSelectedDoctorId(event.target.value)
                      }
                      required
                      disabled={bookingOptionsLoading || doctors.length === 0}
                      className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-white outline-none focus:border-cyan-500 disabled:opacity-60"
                    >
                      <option value="">
                        {bookingOptionsLoading
                          ? "Loading doctors..."
                          : "Select doctor"}
                      </option>
                      {doctors.map((doctor) => (
                        <option key={doctor.id} value={doctor.id}>
                          {doctor.user.fullName} · {doctor.department.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {user.role !== "PATIENT" ? (
                    <label className="text-sm text-slate-300">
                      Patient
                      <select
                        value={selectedPatientId}
                        onChange={(event) =>
                          setSelectedPatientId(event.target.value)
                        }
                        required
                        disabled={
                          bookingOptionsLoading || patients.length === 0
                        }
                        className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-white outline-none focus:border-cyan-500 disabled:opacity-60"
                      >
                        <option value="">
                          {bookingOptionsLoading
                            ? "Loading patients..."
                            : "Select patient"}
                        </option>
                        {patients.map((patient) => (
                          <option key={patient.id} value={patient.id}>
                            {patient.user.fullName} · {patient.mrn}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="text-sm text-slate-300">
                    Available time
                    <select
                      value={selectedSlot}
                      onChange={(event) => setSelectedSlot(event.target.value)}
                      required
                      disabled={slotsLoading || availableSlots.length === 0}
                      className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-white outline-none focus:border-cyan-500 disabled:opacity-60"
                    >
                      <option value="">
                        {slotsLoading
                          ? "Loading times..."
                          : selectedDoctorId
                            ? "No available times"
                            : "Select a doctor first"}
                      </option>
                      {availableSlots.map((slot) => (
                        <option key={slot.start} value={slot.start}>
                          {new Intl.DateTimeFormat(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          }).format(new Date(slot.start))}
                        </option>
                      ))}
                    </select>
                    {slotsError ? (
                      <span className="mt-1 block text-xs text-rose-300">
                        {slotsError}
                      </span>
                    ) : null}
                  </label>
                  <label className="text-sm text-slate-300">
                    Reason
                    <input
                      value={appointmentReason}
                      onChange={(event) =>
                        setAppointmentReason(event.target.value)
                      }
                      maxLength={500}
                      className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-white outline-none focus:border-cyan-500"
                      placeholder="Optional"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={
                      bookingSubmitting ||
                      bookingOptionsLoading ||
                      slotsLoading ||
                      !selectedDoctorId ||
                      !selectedSlot ||
                      (user.role !== "PATIENT" && !selectedPatientId)
                    }
                    className="self-end rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {bookingSubmitting ? "Booking..." : "Book appointment"}
                  </button>
                </form>
              </section>
            ) : null}

            <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white">
                    Today&apos;s appointments
                  </h2>
                  <span className="rounded-full bg-slate-800 px-2 py-1 text-xs font-medium text-slate-300">
                    {appointmentsLoading ? "Loading" : appointments.length}
                  </span>
                </div>

                {appointmentActionError ? (
                  <p className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                    {appointmentActionError}
                  </p>
                ) : null}

                <div className="space-y-4">
                  {appointmentsError ? (
                    <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
                      {appointmentsError}
                    </p>
                  ) : appointmentsLoading ? (
                    <p className="p-4 text-sm text-slate-400">
                      Loading appointments...
                    </p>
                  ) : appointments.length === 0 ? (
                    <p className="p-4 text-sm text-slate-400">
                      No appointments scheduled today.
                    </p>
                  ) : (
                    appointments.slice(0, 5).map((appointment) => (
                      <div
                        key={appointment.id}
                        className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900"
                      >
                        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="font-medium text-slate-100">
                              {new Intl.DateTimeFormat(undefined, {
                                hour: "numeric",
                                minute: "2-digit",
                              }).format(new Date(appointment.startsAt))}{" "}
                              · {appointment.department.name}
                            </div>
                            <div className="mt-1 text-sm text-slate-400">
                              {appointment.patient.user.fullName} with{" "}
                              {appointment.doctor.user.fullName}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-sky-500/10 px-2 py-1 text-xs text-sky-300">
                              {appointment.status
                                .replaceAll("_", " ")
                                .toLowerCase()}
                            </span>
                            {APPOINTMENT_STATUS_ROLES.includes(user.role) ? (
                              <div className="flex flex-wrap gap-2">
                                {getAppointmentActions(appointment.status).map(
                                  (action) => (
                                    <button
                                      key={action.status}
                                      type="button"
                                      disabled={
                                        updatingAppointmentId === appointment.id
                                      }
                                      onClick={() =>
                                        void updateAppointmentStatus(
                                          appointment.id,
                                          action.status,
                                        )
                                      }
                                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-500 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {updatingAppointmentId === appointment.id
                                        ? "Updating..."
                                        : action.label}
                                    </button>
                                  ),
                                )}
                              </div>
                            ) : null}
                            {CLINICAL_NOTE_ROLES.includes(user.role) &&
                            appointment.status === "IN_PROGRESS" ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setClinicalNoteError("");
                                  setClinicalNoteSavedFor(null);
                                  setClinicalNoteDraft(EMPTY_CLINICAL_NOTE);
                                  setEditingClinicalNoteFor(
                                    editingClinicalNoteFor === appointment.id
                                      ? null
                                      : appointment.id,
                                  );
                                }}
                                className="rounded-lg border border-cyan-700 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:border-cyan-500"
                              >
                                {editingClinicalNoteFor === appointment.id
                                  ? "Close note"
                                  : "Clinical note"}
                              </button>
                            ) : null}
                          </div>
                        </div>

                        {clinicalNoteSavedFor === appointment.id ? (
                          <p className="border-t border-slate-800 px-4 py-3 text-sm text-emerald-300">
                            Clinical note saved.
                          </p>
                        ) : null}

                        {editingClinicalNoteFor === appointment.id ? (
                          <form
                            onSubmit={(event) =>
                              void handleClinicalNoteSubmit(
                                event,
                                appointment.id,
                              )
                            }
                            className="grid gap-3 border-t border-slate-800 bg-slate-950/60 p-4 sm:grid-cols-2 lg:grid-cols-4"
                          >
                            {clinicalNoteError ? (
                              <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200 sm:col-span-2 lg:col-span-4">
                                {clinicalNoteError}
                              </p>
                            ) : null}
                            <label className="text-xs text-slate-400">
                              Chief complaint
                              <input
                                value={clinicalNoteDraft.chiefComplaint}
                                onChange={(event) =>
                                  setClinicalNoteDraft((draft) => ({
                                    ...draft,
                                    chiefComplaint: event.target.value,
                                  }))
                                }
                                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
                              />
                            </label>
                            <label className="text-xs text-slate-400">
                              Symptoms
                              <input
                                value={clinicalNoteDraft.symptoms}
                                onChange={(event) =>
                                  setClinicalNoteDraft((draft) => ({
                                    ...draft,
                                    symptoms: event.target.value,
                                  }))
                                }
                                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
                              />
                            </label>
                            <label className="text-xs text-slate-400">
                              Diagnosis
                              <input
                                value={clinicalNoteDraft.diagnosis}
                                onChange={(event) =>
                                  setClinicalNoteDraft((draft) => ({
                                    ...draft,
                                    diagnosis: event.target.value,
                                  }))
                                }
                                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
                              />
                            </label>
                            <label className="text-xs text-slate-400">
                              Treatment plan
                              <input
                                value={clinicalNoteDraft.treatmentPlan}
                                onChange={(event) =>
                                  setClinicalNoteDraft((draft) => ({
                                    ...draft,
                                    treatmentPlan: event.target.value,
                                  }))
                                }
                                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
                              />
                            </label>
                            <label className="text-xs text-slate-400">
                              Blood pressure · systolic
                              <input
                                type="number"
                                value={clinicalNoteDraft.bpSystolic}
                                onChange={(event) =>
                                  setClinicalNoteDraft((draft) => ({
                                    ...draft,
                                    bpSystolic: event.target.value,
                                  }))
                                }
                                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
                              />
                            </label>
                            <label className="text-xs text-slate-400">
                              Blood pressure · diastolic
                              <input
                                type="number"
                                value={clinicalNoteDraft.bpDiastolic}
                                onChange={(event) =>
                                  setClinicalNoteDraft((draft) => ({
                                    ...draft,
                                    bpDiastolic: event.target.value,
                                  }))
                                }
                                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
                              />
                            </label>
                            <label className="text-xs text-slate-400">
                              Pulse
                              <input
                                type="number"
                                value={clinicalNoteDraft.pulse}
                                onChange={(event) =>
                                  setClinicalNoteDraft((draft) => ({
                                    ...draft,
                                    pulse: event.target.value,
                                  }))
                                }
                                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
                              />
                            </label>
                            <label className="text-xs text-slate-400">
                              Temperature · °C
                              <input
                                type="number"
                                step="0.1"
                                value={clinicalNoteDraft.temperatureC}
                                onChange={(event) =>
                                  setClinicalNoteDraft((draft) => ({
                                    ...draft,
                                    temperatureC: event.target.value,
                                  }))
                                }
                                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
                              />
                            </label>
                            <label className="text-xs text-slate-400">
                              SpO₂
                              <input
                                type="number"
                                value={clinicalNoteDraft.spo2}
                                onChange={(event) =>
                                  setClinicalNoteDraft((draft) => ({
                                    ...draft,
                                    spo2: event.target.value,
                                  }))
                                }
                                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
                              />
                            </label>
                            <label className="text-xs text-slate-400">
                              Height · cm
                              <input
                                type="number"
                                step="0.1"
                                value={clinicalNoteDraft.heightCm}
                                onChange={(event) =>
                                  setClinicalNoteDraft((draft) => ({
                                    ...draft,
                                    heightCm: event.target.value,
                                  }))
                                }
                                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
                              />
                            </label>
                            <label className="text-xs text-slate-400">
                              Weight · kg
                              <input
                                type="number"
                                step="0.1"
                                value={clinicalNoteDraft.weightKg}
                                onChange={(event) =>
                                  setClinicalNoteDraft((draft) => ({
                                    ...draft,
                                    weightKg: event.target.value,
                                  }))
                                }
                                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
                              />
                            </label>
                            <label className="text-xs text-slate-400 sm:col-span-2 lg:col-span-3">
                              Notes
                              <textarea
                                value={clinicalNoteDraft.notes}
                                onChange={(event) =>
                                  setClinicalNoteDraft((draft) => ({
                                    ...draft,
                                    notes: event.target.value,
                                  }))
                                }
                                rows={2}
                                className="mt-1.5 w-full resize-y rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
                              />
                            </label>
                            <button
                              type="submit"
                              disabled={clinicalNoteSubmitting}
                              className="self-end rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {clinicalNoteSubmitting
                                ? "Saving..."
                                : "Save clinical note"}
                            </button>
                          </form>
                        ) : null}
                      </div>
                    ))
                  )}
                  {appointments.length > 5 ? (
                    <p className="text-sm text-slate-400">
                      And {appointments.length - 5} more scheduled today.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                <h2 className="text-lg font-semibold text-white">Session</h2>
                <div className="mt-4 space-y-3 text-sm text-slate-300">
                  <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                    <div className="text-slate-400">Name</div>
                    <div className="mt-1 font-medium text-white">
                      {user.fullName}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                    <div className="text-slate-400">Email</div>
                    <div className="mt-1 font-medium text-white">
                      {user.email}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                    <div className="text-slate-400">Role</div>
                    <div className="mt-1 font-medium text-white">
                      {user.role}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
