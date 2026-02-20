import { useEffect, useState, useRef } from "react";
import { Card, CardBody } from "@/shared/components/ui/Card";
import { Button } from "@/shared/components/ui/Button";
import { Input } from "@/shared/components/ui/Input";
import { api } from "@/shared/services/api.client";
import { useAuthStore } from "@/features/auth/store/authSlice";
import { AlertCircle, CheckCircle2, ChevronDown, Key, Camera } from "lucide-react";
import { ProfilePictureModal } from "./ProfilePictureModal";

interface UserProfile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  mobile_number: string | null;
  legal_name: string | null;
  birthday: string | null;
  gender: string | null;
  avatar_url: string | null;
  pin: string | null;
}

const GENDER_OPTIONS = [
  { value: "", label: "Select gender" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

export function SettingsTab() {
  const updateUser = useAuthStore((s) => s.updateUser);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordConfirmOpen, setPasswordConfirmOpen] = useState(false);
  const [fetchingPin, setFetchingPin] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [genderDropdownOpen, setGenderDropdownOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const genderDropdownRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    mobileNumber: "",
    legalName: "",
    birthday: "",
    gender: "",
    pin: "",
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (genderDropdownRef.current && !genderDropdownRef.current.contains(e.target as Node)) {
        setGenderDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    api
      .get("/users/me")
      .then((res) => {
        const data: UserProfile = res.data.data;
        // Format birthday to YYYY-MM-DD for HTML date input
        let birthdayValue = "";
        if (data.birthday) {
          // Check if already in YYYY-MM-DD format
          if (/^\d{4}-\d{2}-\d{2}$/.test(data.birthday)) {
            birthdayValue = data.birthday;
          } else {
            // Parse from other formats
            const date = new Date(data.birthday);
            if (!isNaN(date.getTime())) {
              birthdayValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
            }
          }
        }
        setForm({
          first_name: data.first_name || "",
          last_name: data.last_name || "",
          email: data.email || "",
          mobileNumber: data.mobile_number || "",
          legalName: data.legal_name || "",
          birthday: birthdayValue,
          gender: data.gender || "",
          pin: data.pin || "",
        });
        setAvatarUrl(data.avatar_url || null);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage("");
    setErrorMessage("");
    setSaving(true);

    try {
      await api.put("/users/me", {
        email: form.email,
        mobileNumber: form.mobileNumber,
        legalName: form.legalName,
        birthday: form.birthday || null,
        gender: form.gender || null,
        updated: true,
      });
      setSuccessMessage("Profile updated successfully!");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string; message?: string } } };
      setErrorMessage(error.response?.data?.error || error.response?.data?.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleMobileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, "");
    if (value.length > 10) value = value.slice(0, 10);
    if (!value.startsWith("63") && value.length > 0) {
      value = "63" + value;
    }
    setForm((f) => ({ ...f, mobileNumber: value }));
  };

  const handleGetPin = async () => {
    setFetchingPin(true);
    setErrorMessage("");
    try {
      const res = await api.post("/users/me/pin", {});
      setForm((f) => ({ ...f, pin: res.data.data.pin }));
      setSuccessMessage("PIN code retrieved successfully!");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string; message?: string } } };
      setErrorMessage(error.response?.data?.error || error.response?.data?.message || "Failed to get PIN code");
    } finally {
      setFetchingPin(false);
    }
  };

  const validatePasswordForm = (): boolean => {
    setSuccessMessage("");
    setErrorMessage("");

    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setErrorMessage("Please fill out all password fields.");
      return false;
    }
    if (passwordForm.newPassword.length < 6) {
      setErrorMessage("New password must be at least 6 characters.");
      return false;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setErrorMessage("New password and confirmation do not match.");
      return false;
    }
    if (!refreshToken) {
      setErrorMessage("Session token missing. Please log in again.");
      return false;
    }
    return true;
  };

  const handleChangePassword = async () => {
    if (!validatePasswordForm() || !refreshToken) return;

    setChangingPassword(true);
    try {
      await api.post("/users/me/password", {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
        currentRefreshToken: refreshToken,
      });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setSuccessMessage("Password changed successfully!");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string; message?: string } } };
      setErrorMessage(error.response?.data?.error || error.response?.data?.message || "Failed to change password");
    } finally {
      setChangingPassword(false);
    }
  };

  const selectedGender = GENDER_OPTIONS.find((opt) => opt.value === form.gender) || GENDER_OPTIONS[0];

  if (loading) {
    return (
      <Card>
        <CardBody className="py-12 text-center">
          <div className="animate-pulse space-y-4">
            <div className="mx-auto h-4 w-32 rounded bg-gray-200" />
            <div className="mx-auto h-4 w-48 rounded bg-gray-200" />
            <div className="mx-auto h-4 w-40 rounded bg-gray-200" />
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Profile Picture Section */}
          <div className="flex items-center gap-4">
            <div className="relative h-20 w-20 shrink-0">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Profile"
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-full bg-gray-200">
                  <span className="text-2xl font-medium text-gray-500">
                    {form.first_name?.[0] || form.legalName?.[0] || "?"}
                  </span>
                </div>
              )}
            </div>
            <div>
              <p className="font-medium text-gray-900">
                {form.legalName || `${form.first_name} ${form.last_name}`}
              </p>
              <button
                type="button"
                onClick={() => setProfileModalOpen(true)}
                className="mt-1 text-sm text-primary-600 hover:underline"
              >
                Add/Change Profile Picture
              </button>
            </div>
          </div>

          {successMessage && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              {successMessage}
            </div>
          )}

          {errorMessage && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" />
              {errorMessage}
            </div>
          )}

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Personal Information</h3>

            {/* Two Column Layout */}
            <div className="grid gap-6 sm:grid-cols-2">
              {/* Column 1 */}
              <div className="space-y-4">
                {/* Legal Name */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">Legal Name</label>
                  <Input
                    type="text"
                    value={form.legalName}
                    onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))}
                    placeholder="Enter your full legal name"
                  />
                </div>

                {/* Email Address */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">Email Address</label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="Enter your email address"
                  />
                </div>

                {/* Mobile Number */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">Mobile Number</label>
                  <div className="flex rounded-md shadow-sm">
                    <span className="inline-flex items-center rounded-l-md border border-r-0 border-gray-300 bg-gray-50 px-3 text-sm text-gray-500">
                      +63
                    </span>
                    <Input
                      type="text"
                      value={form.mobileNumber.replace(/^63/, "")}
                      onChange={handleMobileChange}
                      placeholder="9123456789"
                      className="rounded-l-none"
                    />
                  </div>
                </div>
              </div>

              {/* Column 2 */}
              <div className="space-y-4">
                {/* Birthday */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">Birthday</label>
                  <Input
                    type="date"
                    value={form.birthday}
                    onChange={(e) => setForm((f) => ({ ...f, birthday: e.target.value }))}
                    className="w-full"
                  />
                </div>

                {/* Gender - Branch Dropdown Style */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">Gender</label>
                  <div ref={genderDropdownRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setGenderDropdownOpen((o) => !o)}
                      className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm hover:bg-gray-50 focus:outline-none"
                    >
                      <span className={form.gender ? "text-gray-900" : "text-gray-500"}>
                        {selectedGender.label}
                      </span>
                      <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${genderDropdownOpen ? "rotate-180" : ""}`} />
                    </button>

                    {genderDropdownOpen && (
                      <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                        {GENDER_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setForm((f) => ({ ...f, gender: opt.value }));
                              setGenderDropdownOpen(false);
                            }}
                            className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                              form.gender === opt.value ? "bg-primary-50 text-primary-700 font-medium" : "text-gray-700"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* POS PIN Code */}
                <div className="space-y-1">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <Key className="h-4 w-4 text-gray-400" />
                    POS PIN Code
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={form.pin}
                      readOnly
                      placeholder="No PIN code"
                      className="flex-1 bg-gray-50"
                    />
                    {!form.pin && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleGetPin}
                        disabled={fetchingPin}
                      >
                        {fetchingPin ? "Getting..." : "Get PIN"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 border-t border-gray-100 pt-4">
            <h3 className="text-sm font-semibold text-gray-900">Change Password</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Current Password</label>
                <Input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm((f) => ({ ...f, currentPassword: e.target.value }))}
                  placeholder="Enter current password"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">New Password</label>
                <Input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm((f) => ({ ...f, newPassword: e.target.value }))}
                  placeholder="At least 6 characters"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Confirm New Password</label>
                <Input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                  placeholder="Re-enter new password"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="standard"
                onClick={() => {
                  if (!validatePasswordForm()) return;
                  setPasswordConfirmOpen(true);
                }}
                disabled={changingPassword}
              >
                {changingPassword ? "Changing..." : "Change Password"}
              </Button>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" variant="success" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </CardBody>

      {/* Profile Picture Modal */}
      <ProfilePictureModal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        onUploadComplete={(url) => {
          setAvatarUrl(url);
          updateUser({ avatarUrl: url });
          setSuccessMessage("Profile picture updated successfully!");
        }}
      />

      {passwordConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="border-b border-gray-200 px-5 py-4">
              <p className="font-semibold text-gray-900">Confirm Password Change</p>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-gray-700">
                Changing your password will log you out of all other sessions except your current session.
                Do you want to continue?
              </p>
            </div>
            <div className="flex gap-3 border-t border-gray-200 px-5 py-4">
              <Button
                type="button"
                className="flex-1"
                variant="standard"
                disabled={changingPassword}
                onClick={async () => {
                  await handleChangePassword();
                  setPasswordConfirmOpen(false);
                }}
              >
                {changingPassword ? "Changing..." : "Confirm"}
              </Button>
              <Button
                type="button"
                className="flex-1"
                variant="secondary"
                disabled={changingPassword}
                onClick={() => setPasswordConfirmOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
