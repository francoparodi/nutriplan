# Doctor guide

## What is Nutriplan
Nutriplan is a web application to create personalised **meal plans** and follow patients over time. You build the diet (meals, alternatives, quantities and equivalent substitutions), assign it to the patient and watch how it is followed: the patient fills in their diary and logs their weight, and you see adherence, progress, visits and documents in a single record.

Each doctor works in their own space: you only see your own patients and diets. Plans can be downloaded as PDF and data exported as PDF or Excel; a full backup of your data is available.


## Login and registration
- Log in with your credentials. The login stays active after closing the browser.
- New doctors: **Are you a doctor? Register** on the login page. The account waits until the administrator activates it (or the administrator creates it and gives you a temporary password).
- Each doctor sees **only their own patients and diets**.

## Patients
**Patients** lists your patients with latest weight, 7-day adherence, off-plan meals and days with an incomplete diary.

### New patient
Press **New patient**, enter the name and (optionally) username, email and password. If left empty they are generated. Give the patient the **temporary password**: it is one-time and must be replaced at first login.

### Patient record
**Record** tab: personal data, height, target weight, allergies, intolerances, conditions, medications, history, private notes (hidden from the patient) and free **custom fields**. Here you can also **reset the password** (new one-time password, the patient's sessions are closed), **deactivate** the account or **delete** the patient.

If the patient has uploaded a profile photo it appears next to their name in the list and in the record.

### Visits
**Visits** tab: record each check-up with date, weight, **waist**, **leg muscle length**, **calf circumference**, **biceps circumference**, any other measurements, notes and attachments (photos and documents). Visits are visible to the patient, read-only, in their Profile; the measurements trend appears in the **Progress** page.

### Documents, photos and recipes
**Documents** tab: upload files (max 15 MB) as document, photo or recipe. **Share** makes them visible to the patient. Files uploaded by the patient appear here, labelled “Uploaded by patient”.

## Diets
**Diets** lists all plans. You can **edit**, **duplicate**, **assign**, download the **PDF** or **delete**.

### Import a diet from PDF
In the **Diets** page, **Import from PDF** uploads `Franco.pdf` or `Giorgia.pdf`: the ready-made diet is created as a **template** (not assigned to any patient) and opens in the editor. The **Example PDF** button downloads `Franco.pdf`, to use as a test. Only these two plans are recognised at the moment; other PDFs are rejected.

### Plan structure
- **Meals**: breakfast, lunch, dinner… each with time and notes. A meal can be “same as” another (e.g. dinner as lunch). *Extra* meals (oil, dessert…) are optional.
- **Alternatives**: A, B, C… (with course I/II and an optional weekly maximum). The patient picks one. An “always included” alternative applies to all (e.g. side dish).
- **Foods**: name, quantity, unit, free text and optionally the **substitution group** (the \* of the paper plan).
- **Substitution groups**: e.g. *Meat 200 g* with its equivalents (ricotta 120 g, fish 220 g…). Quantities shown to the patient are scaled to the planned quantity.
- **Guidelines and conversions**: general guidelines and the **raw/cooked** conversion table (for each food the raw weight and the equivalent cooked weight, both editable), shown to the patient and printed in the PDF.
- **Preview**: shows the plan as the patient will see it.

Press **Save** to apply changes. To keep diary history when the plan changes over time, create a new diet with **Assign** and a start date: the previous one is ended the day before.

### Allergy and condition warning
If the patient has allergies, intolerances or conditions (entered by you in the record or reported by them in their Profile), a **red warning** stays visible while you create or edit their diet, in the patient's **Diet** tab and when you assign a plan. On every **save** and every assignment you are asked to confirm that you have checked compatibility.

### Assignment
From the patient (**Diet** tab) or the diet list: choose patient, start/end dates and whether to assign a **copy** (recommended, the template stays intact) or **move** the diet.

## Following progress
- **Progress**: weight with target, daily adherence (as planned / off plan / skipped / missing), summary for 30 days, 3 months, 6 months or 1 year. At the bottom of the page download the **PDF or Excel report** for a date range.
- **Diary**: coloured calendar and day detail: chosen alternative, substitutions, off-plan food, notes. If the patient changed the quantity of a food, the change (planned → actual) is **highlighted** in amber; the number of meals with changed quantities appears in **Progress** and in the PDF/Excel reports. Doctors view but do not edit the diary.

## Contacts
In **Profile** you can optionally enter phone, WhatsApp, Telegram, Instagram, Facebook and website: your patients will see them in their profile. In the patient record you find their contacts as clickable links.

## Backup
**Backup** downloads a ZIP with all **your** data (patients, records, documents, diets, diary, weights). **Restore** replaces your data with the file's content; other doctors' data is untouched. A backup from another doctor is rejected.

## Profile
Change password, email, light/dark theme and IT/EN language.
