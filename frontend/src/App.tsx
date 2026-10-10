import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { Spinner } from "./components/Common";
import { Shell } from "./layout/Shell";
import { ForcedPasswordPage, LoginPage, RegisterPage } from "./pages/auth/AuthPages";
import { HelpPage, ProfilePage } from "./pages/Profile";
import { DiaryPage, PatientDocumentsPage, PlanPage, ProgressPage, WeightPage } from "./pages/patient/PatientPages";
import { PatientsPage } from "./pages/doctor/Patients";
import { PatientPage } from "./pages/doctor/PatientPage";
import { BackupPage, DietsPage } from "./pages/doctor/Diets";
import { DietEditorPage } from "./pages/doctor/DietEditor";
import { DashboardPage, LogsPage, UsersPage } from "./pages/admin/AdminPages";
import { ImportDietsPage } from "./pages/admin/ImportPage";
import { HOME } from "./lib/home";

export function App() {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner />;
  if (!user) {
    return (
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }
  if (user.must_change_password) return <ForcedPasswordPage />;

  const home = <Navigate to={HOME[user.role]} replace />;
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={home} />
        <Route path="/login" element={home} />
        <Route path="/register" element={home} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/help" element={<HelpPage />} />
        {user.role === "patient" && (
          <>
            <Route path="/diary" element={<DiaryPage />} />
            <Route path="/diary/:date" element={<DiaryPage />} />
            <Route path="/weight" element={<WeightPage />} />
            <Route path="/progress" element={<ProgressPage />} />
            <Route path="/documents" element={<PatientDocumentsPage />} />
            <Route path="/plan" element={<PlanPage />} />
          </>
        )}
        {user.role === "doctor" && (
          <>
            <Route path="/patients" element={<PatientsPage />} />
            <Route path="/patients/:id" element={<PatientPage />} />
            <Route path="/patients/:id/:tab" element={<PatientPage />} />
            <Route path="/patients/:id/:tab/:date" element={<PatientPage />} />
            <Route path="/diets" element={<DietsPage />} />
            <Route path="/diets/:id" element={<DietEditorPage />} />
            <Route path="/backup" element={<BackupPage />} />
          </>
        )}
        {user.role === "admin" && (
          <>
            <Route path="/admin" element={<DashboardPage />} />
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/logs" element={<LogsPage />} />
            <Route path="/admin/logs/:tab" element={<LogsPage />} />
            <Route path="/admin/import" element={<ImportDietsPage />} />
            <Route path="/admin/backup" element={<BackupPage admin />} />
          </>
        )}
        <Route path="*" element={home} />
      </Route>
    </Routes>
  );
}
