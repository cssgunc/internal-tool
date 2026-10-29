"use client";

import { useEffect, useState } from "react";
import {
  ALLOWED_PLACEHOLDERS,
  EMAIL_KINDS,
  renderTemplate,
  type EmailKind,
} from "@internal-tool/shared";
import { api } from "@/lib/api";

type Template = {
  kind: EmailKind;
  subject: string;
  body: string;
};

const SAMPLE_DATA: Record<string, string> = {
  firstName: "Sarah",
  siteUrl: "https://example.com",
  projectName: "Community Connect",
  inviteToken: "sample-invite-token",
  resetUrl: "https://example.com/reset",
  closingDate: "November 15",
};

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedKind, setSelectedKind] = useState<EmailKind>(EMAIL_KINDS[0]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState("");

  // Load email templates from the API when the page opens.
  useEffect(() => {
    async function loadTemplates() {
      try {
        const response = await api.api.v1["email-templates"].$get();

        if (!response.ok) {
          throw new Error("Failed to load email templates.");
        }

        const data = await response.json();

        setTemplates(data.items);

        // Initialize the editor with the first email template.
        const initialTemplate = data.items.find((template) => template.kind === EMAIL_KINDS[0]);

        setSubject(initialTemplate?.subject ?? "");
        setBody(initialTemplate?.body ?? "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setLoading(false);
      }
    }

    void loadTemplates();
  }, []);

  // Update the editor when the user selects a different template.
  function handleTemplateChange(kind: EmailKind) {
    setSelectedKind(kind);

    const selected = templates.find((template) => template.kind === kind);

    setSubject(selected?.subject ?? "");
    setBody(selected?.body ?? "");

    setFieldErrors({});
    setError("");
    setSuccess("");
  }

  // Get the placeholders allowed for the selected email kind.
  const allowed = ALLOWED_PLACEHOLDERS[selectedKind];

  // Generate live previews using sample data.
  const subjectPreview = renderTemplate(subject, SAMPLE_DATA, allowed);
  const bodyPreview = renderTemplate(body, SAMPLE_DATA, allowed);

  // Save changes through the typed API client.
  async function handleSave() {
    setSaving(true);
    setError("");
    setFieldErrors({});
    setSuccess("");

    try {
      const response = await api.api.v1["email-templates"][":kind"].$put({
        param: { kind: selectedKind },
        json: {
          subject,
          body,
        },
      });

      if (!response.ok) {
        const result = await response.json();

        if ("error" in result) {
          setError(result.error.message);

          if (result.error.fields) {
            setFieldErrors(result.error.fields);
          }
        } else {
          setError("Failed to save template.");
        }

        return;
      }

      const updated = await response.json();

      // Update the locally stored template after saving.
      setTemplates((previous) =>
        previous.map((template) => (template.kind === updated.kind ? updated : template))
      );

      setSuccess("Template saved successfully!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  // Show a loading state while fetching templates.
  if (loading) {
    return (
      <main className="p-8">
        <p>Loading email templates...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-8">
      {/* Page heading */}
      <div>
        <h1 className="text-3xl font-bold">Email Templates</h1>

        <p className="mt-2 text-gray-600">Edit and preview recruiting email templates.</p>
      </div>

      {/* General error message */}
      {error && (
        <div role="alert" className="rounded bg-red-100 p-4 text-red-700">
          {error}
        </div>
      )}

      {/* Success message */}
      {success && (
        <div role="status" className="rounded bg-green-100 p-4 text-green-700">
          {success}
        </div>
      )}

      {/* Template selector */}
      <div className="space-y-2">
        <label htmlFor="kind" className="block font-medium">
          Email Type
        </label>

        <select
          id="kind"
          value={selectedKind}
          onChange={(event) => handleTemplateChange(event.target.value as EmailKind)}
          disabled={saving}
          className="w-full rounded border p-3"
        >
          {EMAIL_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>

      {/* Email editor */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Edit Template</h2>

        {/* Subject field */}
        <div>
          <label htmlFor="subject" className="mb-2 block font-medium">
            Subject
          </label>

          <input
            id="subject"
            type="text"
            value={subject}
            onChange={(event) => {
              setSubject(event.target.value);
              setSuccess("");
            }}
            disabled={saving}
            className="w-full rounded border p-3"
          />

          {fieldErrors.subject && (
            <p className="mt-1 text-sm text-red-600">{fieldErrors.subject}</p>
          )}
        </div>

        {/* Body field */}
        <div>
          <label htmlFor="body" className="mb-2 block font-medium">
            Body
          </label>

          <textarea
            id="body"
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              setSuccess("");
            }}
            disabled={saving}
            rows={10}
            className="w-full rounded border p-3"
          />

          {fieldErrors.body && <p className="mt-1 text-sm text-red-600">{fieldErrors.body}</p>}
        </div>

        {/* Available placeholders */}
        <div className="rounded bg-gray-50 p-4">
          <p className="text-sm font-medium text-gray-700">Available placeholders:</p>

          <p className="mt-1 text-sm text-gray-600">
            {allowed.map((placeholder) => `{{${placeholder}}}`).join(", ")}
          </p>
        </div>
      </section>

      {/* Live preview */}
      <section className="space-y-4 rounded border bg-gray-50 p-6">
        <h2 className="text-xl font-semibold">Live Preview</h2>

        {/* Subject preview */}
        <div>
          <h3 className="font-medium">Subject</h3>

          <p className="mt-1 whitespace-pre-wrap">{subjectPreview.rendered}</p>
        </div>

        {/* Body preview */}
        <div>
          <h3 className="font-medium">Body</h3>

          <p className="mt-1 whitespace-pre-wrap">{bodyPreview.rendered}</p>
        </div>

        {/* Placeholder errors */}
        {[...subjectPreview.errors, ...bodyPreview.errors].map((previewError, index) => (
          <p key={`${previewError}-${index}`} className="text-sm text-red-600">
            {previewError}
          </p>
        ))}
      </section>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || templates.length === 0}
          className="rounded bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </main>
  );
}
