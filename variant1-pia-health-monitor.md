# Variant 1: Privacy Impact Assessment for a Smart Health Monitoring System

## Document Control

- Document title: Privacy Impact Assessment (PIA) for a wearable health monitoring device
- System name: `HealthBand One`
- Version: `1.0`
- Date: `2026-03-25`
- Prepared for: Variant 1 coursework submission

## Executive Summary

This Privacy Impact Assessment evaluates the privacy implications of `HealthBand One`, a wearable device that monitors heart rate, activity level, sleep patterns, and geolocation. The system includes the wearable device, a companion mobile application, a cloud platform for storage and analytics, and optional data sharing with healthcare providers and emergency contacts.

The assessment identifies key privacy risks associated with sensitive health data, behavioral profiling, location tracking, unauthorized access, secondary use of data, excessive retention, and third-party sharing. Because the system processes both health information and geolocation, the overall privacy impact is considered high unless strong safeguards are implemented from the beginning.

This PIA recommends a Privacy by Design approach centered on data minimization, explicit consent, strong access controls, encryption, short retention periods for raw data, transparent user controls, and a strict separation between core health functions and optional data sharing features.

## 1. System Description

### 1.1 Device Name and Core Functions

`HealthBand One` is a wearable health monitoring device designed to support personal wellness monitoring and safety use cases.

Core functions:

- Continuous heart rate monitoring
- Activity tracking based on movement and step count
- Sleep tracking and sleep quality estimation
- Optional geolocation tracking for route history, emergency assistance, and activity context
- Mobile app dashboard for trends, alerts, and privacy settings
- Cloud synchronization for backup, analytics, and cross-device access

### 1.2 Categories of Personal Data Collected

| Data category | Examples | Sensitivity level |
|---|---|---|
| Account data | name, email, age range, account ID | Medium |
| Device identifiers | device serial number, app instance ID, IP address | Medium |
| Health data | heart rate, resting heart rate, abnormal heart rate alerts | High |
| Activity data | steps, workout duration, calories, intensity level | Medium |
| Sleep data | sleep duration, sleep phases, wake intervals, sleep score | High |
| Location data | GPS coordinates, route history, home/work patterns | High |
| Support and diagnostics | crash logs, sync errors, device firmware version | Low to Medium |

### 1.3 Purpose of Data Processing

The system processes personal data for the following purposes:

- To provide real-time health and activity monitoring
- To present historical trends and personalized insights in the app
- To detect possible health anomalies and generate wellness notifications
- To provide emergency or safety features when enabled by the user
- To synchronize data across the wearable, mobile app, and user account
- To improve device reliability, bug fixing, and service performance
- To comply with legal and security obligations

### 1.4 Stakeholders and Responsible Parties

| Party | Role |
|---|---|
| User | Data subject, controller of optional sharing choices and privacy settings |
| Manufacturer | Device producer, firmware maintainer, security owner |
| Platform operator | Mobile app and cloud service provider, storage and analytics operator |
| Healthcare provider | Optional recipient of shared reports, only when explicitly enabled |
| Emergency contact | Optional recipient of emergency alerts, only when explicitly enabled |

### 1.5 Assumed Data Lifecycle

1. The wearable collects raw sensor and location data.
2. Data is temporarily stored on the device.
3. The mobile app receives data through a secure local connection.
4. Selected data is synchronized to the cloud platform.
5. The platform stores, analyzes, and visualizes user trends.
6. Optional reports or alerts may be shared with third parties after user action or prior consent.
7. Data is retained according to category-specific retention rules and then deleted or anonymized.

## 2. Data Flow Diagram

### 2.1 Embedded Diagram

![Data Flow Diagram](data-flow-diagram.png)

### 2.2 Textual Description of the Data Flow

- The user wears `HealthBand One`, which collects heart rate, activity, sleep, and optional location data.
- The wearable sends data to the companion mobile app over a secure short-range connection.
- The mobile app displays recent values, privacy controls, and user notifications.
- The mobile app sends selected data to the cloud platform for backup, analytics, and account access.
- The cloud platform may send alerts, summaries, or recommendations back to the mobile app.
- If the user explicitly enables sharing, summary reports may be shared with a healthcare provider or emergency contact.
- The support function may receive limited diagnostics data when the user submits a support request.

## 3. Privacy Risk Analysis Method

This assessment uses a qualitative risk model:

- Severity: `Low`, `Medium`, `High`
- Likelihood: `Low`, `Medium`, `High`

Severity reflects the impact on the user if the risk materializes. Likelihood reflects how realistically the event could occur without mitigations.

## 4. Privacy Risk Register

| ID | Privacy risk | Impact description | Severity | Likelihood | Mitigation strategy | Responsible side |
|---|---|---|---|---|---|---|
| R1 | Unauthorized access to health records | Exposure of heart rate and sleep data could reveal medical conditions or vulnerabilities | High | Medium | End-to-end encryption in transit, encryption at rest, MFA, secure session handling, access logging, periodic penetration testing | Manufacturer + Platform |
| R2 | Location tracking reveals daily routine | Attackers or insiders could infer home address, workplace, habits, and periods of absence | High | Medium | Location collection disabled by default, granular consent, approximate location mode, local processing where possible, short retention, route deletion controls | User + Platform + Manufacturer |
| R3 | Secondary use of data for advertising or profiling | Data may be reused beyond the original health purpose, reducing trust and violating expectations | High | Medium | Purpose limitation policy, separate opt-in for marketing, contractual prohibition on ad profiling, internal governance review for new use cases | Platform + Manufacturer |
| R4 | Excessive data retention | Long-term storage increases the consequences of breaches and enables invasive longitudinal profiling | Medium | High | Defined retention schedule, auto-delete raw location after a short period, archive only aggregated summaries, user-triggered delete/export tools | Platform |
| R5 | Inference of sensitive conditions from combined datasets | Sleep, heart rate, and location together can expose religion, pregnancy, stress, illness, or mental health patterns | High | Medium | Data minimization, separation of identifiers from analytics data, aggregation for research, differential access by role, privacy review for derived insights | Platform + Manufacturer |
| R6 | Over-sharing with healthcare providers or emergency contacts | Reports may disclose more information than needed for the intended purpose | Medium | Medium | Share only purpose-specific summaries, preview before sending, fine-grained scopes, time-limited access links, recipient audit trail | User + Platform |
| R7 | Weak default settings and confusing consent | Users may unintentionally enable tracking or sharing without understanding the consequences | High | Medium | Privacy-protective defaults, layered notices, clear consent flows, just-in-time prompts, periodic privacy reminders | Manufacturer + Platform |
| R8 | Diagnostics and support logs leak personal data | Technical logs may contain identifiers, timestamps, or health event references | Medium | Medium | Log minimization, masking, short retention, support access controls, consent before uploading diagnostics | Platform + Manufacturer |

## 5. Detailed Risk Discussion

### R1. Unauthorized Access to Health Records

Health and sleep data are highly sensitive. If compromised, they can be used for embarrassment, discrimination, or fraud. The system should treat these data as requiring the strongest technical and organizational controls.

### R2. Location Tracking Reveals Routine and Physical Presence

Location data is especially sensitive because it can reveal where the user lives, works, exercises, worships, or seeks medical treatment. Even if heart rate data is pseudonymized, location can quickly re-identify a person.

### R3. Secondary Use Beyond Health Monitoring

Users may reasonably expect that wearable health data is used for wellness functionality only. Reuse for advertising, insurance scoring, behavioral targeting, or cross-platform profiling creates significant privacy harm.

### R4. Excessive Retention

Even secure systems become riskier when they retain too much data for too long. The privacy impact grows as historical patterns become more detailed and more valuable to malicious actors.

### R5. Sensitive Inferences from Combined Data

The combination of heart rate, sleep quality, activity, and geolocation can reveal more than the original raw records. This includes stress levels, possible illness, lifestyle patterns, and attendance at sensitive places.

### R6. Over-Sharing Through External Reports

Emergency alerts and healthcare reports are useful, but they should be scoped to what is necessary. A summary for an emergency contact should not expose the user's full location history or long-term sleep profile.

### R7. Weak Defaults and Consent Fatigue

If geolocation or sharing is enabled by default, users may unknowingly expose high-risk data. Consent must be specific, informed, reversible, and separated by purpose.

### R8. Diagnostic Leakage

Support features often bypass normal user expectations. Logs should never become a hidden channel for sensitive information collection.

## 6. Mitigation Strategy Summary

### 6.1 Technical Controls

- Encrypt data in transit between wearable, mobile app, and cloud
- Encrypt sensitive data at rest using modern key management
- Apply role-based access control for internal and external recipients
- Use multi-factor authentication for account access
- Store location separately from core health metrics when feasible
- Prefer on-device or on-phone preprocessing for raw sensor data
- Minimize logging and mask identifiers in diagnostics
- Use automatic retention and deletion mechanisms

### 6.2 Organizational Controls

- Maintain a formal privacy policy with purpose limitation
- Perform regular privacy and security audits
- Review all new features for privacy impact before release
- Maintain incident response and breach notification procedures
- Train staff with access to support, analytics, and operations tools

### 6.3 User Controls

- Provide a privacy dashboard with simple settings
- Allow users to disable geolocation without losing core health features
- Allow export, deletion, and correction of personal data
- Provide controls for temporary sharing, permanent sharing, and revocation
- Provide a preview of all data shared with third parties

## 7. Privacy by Design Recommendations

The following recommendations should be built into the system architecture from the start:

1. Data minimization by default.
Only collect the minimum data needed for the selected feature. Geolocation should be optional and disabled by default.

2. Privacy-protective defaults.
The initial configuration should favor local processing, limited retention, and no third-party sharing until the user explicitly opts in.

3. Purpose separation.
Health monitoring, support diagnostics, research analytics, and marketing must remain logically and contractually separate.

4. Granular consent.
Consent should be collected separately for geolocation, provider sharing, emergency features, and product improvement analytics.

5. Short raw-data retention.
Keep high-resolution raw location and sensor streams only as long as operationally necessary, then replace them with aggregated summaries.

6. Transparency and explainability.
Users should understand what is collected, why it is collected, where it is stored, who can access it, and how long it is kept.

7. User autonomy.
Users must be able to pause tracking, delete history, revoke sharing, and download their own records without friction.

8. Secure architecture.
Apply secure coding, threat modeling, encryption, audit logging, and least-privilege access throughout the device, app, and cloud stack.

9. Pseudonymization and separation.
Where analytics is required, separate direct identifiers from telemetry and use pseudonymous identifiers whenever possible.

10. Continuous privacy review.
Any new feature, especially AI insights or third-party integrations, should trigger an updated PIA before deployment.

## 8. Recommended Retention Approach

| Data type | Recommended retention |
|---|---|
| Raw heart rate telemetry | 30 to 90 days unless needed for a user-visible history feature |
| Activity summaries | Up to account lifetime, subject to deletion rights |
| Detailed sleep sessions | 90 days to 1 year depending on user setting |
| Raw geolocation traces | 7 to 30 days maximum |
| Aggregated trend summaries | Up to account lifetime, subject to deletion rights |
| Support diagnostics | 30 days or less |

## 9. Residual Risk Assessment

After the proposed mitigations are applied, the remaining residual risk is estimated as:

- High residual concern: location privacy and sensitive inferences
- Medium residual concern: unauthorized access and over-sharing
- Low to medium residual concern: diagnostics leakage and retention, if deletion automation is enforced

The system can be considered conditionally acceptable only if location tracking remains optional, privacy defaults remain strict, and sharing with third parties is transparent and reversible.

## 10. Final Conclusion

`HealthBand One` can provide meaningful health and wellness value, but it processes categories of data that are highly sensitive from a privacy perspective. The combination of biometric data, sleep behavior, and geolocation creates a significant privacy risk if the system is not carefully designed.

The PIA concludes that the system should only be deployed with strong Privacy by Design controls. The most important requirements are data minimization, explicit consent, strong security, short retention for raw data, and user control over sharing and deletion. With these measures in place, the platform can reduce privacy risks to a more manageable level while preserving the core health monitoring functionality.
