import React from "react";

export default function PrivacyPolicy() {
  const prefersDark =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const palette = prefersDark
    ? {
        background: "#101815",
        heading: "#EAF1ED",
        body: "#C3D0CA",
        muted: "#8FA19A",
        border: "#263831",
        link: "#88A879",
      }
    : {
        background: "#ffffff",
        heading: "#111827",
        body: "#374151",
        muted: "#6B7280",
        border: "#E5E7EB",
        link: "#10b981",
      };

  return (
    <div
      style={{
        minHeight: "100vh",
        height: "100%",
        overflowY: "auto",
        backgroundColor: palette.background,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "800px",
          margin: "0 auto",
          padding: "48px 24px",
        }}
      >
        <h1
          style={{
            fontSize: "36px",
            fontWeight: "bold",
            color: palette.heading,
            marginBottom: "16px",
          }}
        >
          Privacy Policy
        </h1>
        <p
          style={{
            fontSize: "14px",
            color: palette.muted,
            marginBottom: "32px",
          }}
        >
          Last updated: {new Date().toLocaleDateString()}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
          <section>
            <h2 style={{ fontSize: "24px", fontWeight: "600", color: palette.heading, marginBottom: "12px" }}>
              1. Introduction
            </h2>
            <p style={{ fontSize: "16px", color: palette.body, lineHeight: "1.75" }}>
              Welcome to AlNoor Library. We respect your privacy and are committed to protecting
              your personal data. This privacy policy explains how we handle your information when
              you use our mobile application.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "24px", fontWeight: "600", color: palette.heading, marginBottom: "12px" }}>
              2. Information We Collect
            </h2>
            <p style={{ fontSize: "16px", color: palette.body, lineHeight: "1.75", marginBottom: "8px" }}>
              AlNoor Library is designed with privacy in mind. We collect minimal information:
            </p>
            <ul style={{ marginLeft: "24px", fontSize: "16px", color: palette.body, lineHeight: "1.75" }}>
              <li>Reading progress and bookmarks stored locally on your device</li>
              <li>Appearance preferences and offline download data stored locally</li>
              <li>App settings required to maintain your reading experience</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: "24px", fontWeight: "600", color: palette.heading, marginBottom: "12px" }}>
              3. How We Use Your Information
            </h2>
            <p style={{ fontSize: "16px", color: palette.body, lineHeight: "1.75", marginBottom: "8px" }}>
              We use this information to:
            </p>
            <ul style={{ marginLeft: "24px", fontSize: "16px", color: palette.body, lineHeight: "1.75" }}>
              <li>Remember your reading position and bookmarks</li>
              <li>Support offline reading and downloaded volume access</li>
              <li>Maintain your appearance and app preferences</li>
              <li>Improve app continuity and stability</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: "24px", fontWeight: "600", color: palette.heading, marginBottom: "12px" }}>
              4. Data Storage
            </h2>
            <p style={{ fontSize: "16px", color: palette.body, lineHeight: "1.75" }}>
              Your reading data is stored locally on your device. We do not require account creation
              for reading and do not store your personal reading activity on our servers.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "24px", fontWeight: "600", color: palette.heading, marginBottom: "12px" }}>
              5. Third-Party Services
            </h2>
            <p style={{ fontSize: "16px", color: palette.body, lineHeight: "1.75" }}>
              AlNoor Library may retrieve published book metadata and page assets from third-party
              delivery services so books can be loaded on your device. These services may process
              technical request data required for content delivery.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "24px", fontWeight: "600", color: palette.heading, marginBottom: "12px" }}>
              6. Children&apos;s Privacy
            </h2>
            <p style={{ fontSize: "16px", color: palette.body, lineHeight: "1.75" }}>
              Our app is suitable for all ages. We do not knowingly collect personal information from
              children. The app does not require registration or account creation.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "24px", fontWeight: "600", color: palette.heading, marginBottom: "12px" }}>
              7. Your Rights
            </h2>
            <p style={{ fontSize: "16px", color: palette.body, lineHeight: "1.75", marginBottom: "8px" }}>
              You can:
            </p>
            <ul style={{ marginLeft: "24px", fontSize: "16px", color: palette.body, lineHeight: "1.75" }}>
              <li>Clear your local reading data from inside the app</li>
              <li>Delete local data by uninstalling the app or clearing app storage</li>
              <li>Stop using the app at any time</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: "24px", fontWeight: "600", color: palette.heading, marginBottom: "12px" }}>
              8. Changes to This Policy
            </h2>
            <p style={{ fontSize: "16px", color: palette.body, lineHeight: "1.75" }}>
              We may update this privacy policy from time to time. Any updates will be reflected on
              this page along with the latest update date.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "24px", fontWeight: "600", color: palette.heading, marginBottom: "12px" }}>
              9. Contact Us
            </h2>
            <p style={{ fontSize: "16px", color: palette.body, lineHeight: "1.75" }}>
              If you have any questions about this privacy policy, please contact us at:
            </p>
            <p style={{ fontSize: "16px", color: palette.body, lineHeight: "1.75", marginTop: "8px" }}>
              Email:{" "}
              <a
                href="mailto:mdsahil1631@gmail.com"
                style={{ color: palette.link, textDecoration: "none" }}
              >
                mdsahil1631@gmail.com
              </a>
            </p>
          </section>
        </div>

        <div
          style={{
            marginTop: "48px",
            paddingTop: "24px",
            borderTop: `1px solid ${palette.border}`,
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "14px", color: palette.muted }}>
            © {new Date().getFullYear()} AlNoor Library. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
