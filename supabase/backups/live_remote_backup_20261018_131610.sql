--
-- PostgreSQL database dump
--

\restrict dHfPyOF1wRi4nepeKplvb1njLbBVqpMrdCNVErdU5eDajklTIfc9A2hn3LdbjlH

-- Dumped from database version 17.11
-- Dumped by pg_dump version 18.6 (Postgres.app)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";

--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: current_user_role(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."current_user_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT role FROM public.users
    WHERE auth_user_id = auth.uid() AND active = true
    LIMIT 1;
$$;


ALTER FUNCTION "public"."current_user_role"() OWNER TO "postgres";

--
-- Name: current_user_staff_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."current_user_staff_id"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT employee_id FROM public.users
    WHERE auth_user_id = auth.uid() AND active = true
    LIMIT 1;
$$;


ALTER FUNCTION "public"."current_user_staff_id"() OWNER TO "postgres";

--
-- Name: fn_check_client_deletion_protection(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."fn_check_client_deletion_protection"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
    salon_now_date DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
    salon_now_time TIME := (now() AT TIME ZONE 'Asia/Kolkata')::time;
    has_blocking BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.appointments
        WHERE client_id = OLD.id
          AND status IN ('scheduled', 'confirmed')
          AND (date > salon_now_date OR (date = salon_now_date AND end_time > salon_now_time))
    ) INTO has_blocking;

    IF has_blocking THEN
        RAISE EXCEPTION 'Cannot delete this client because an upcoming or active appointment exists for this client.';
    END IF;

    -- Snapshot details on historical appointments before foreign key is set null
    UPDATE public.appointments
    SET client_name = COALESCE(client_name, OLD.name),
        client_phone = COALESCE(client_phone, OLD.phone),
        client_email = COALESCE(client_email, OLD.email)
    WHERE client_id = OLD.id;

    RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."fn_check_client_deletion_protection"() OWNER TO "postgres";

--
-- Name: fn_check_last_owner_protection(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."fn_check_last_owner_protection"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
    remaining_owners INTEGER;
    salon_now_date DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
    salon_now_time TIME := (now() AT TIME ZONE 'Asia/Kolkata')::time;
    has_blocking BOOLEAN;
BEGIN
    IF TG_OP = 'DELETE' THEN
        -- If user is linked to staff, check appointment protection
        IF OLD.employee_id IS NOT NULL THEN
            SELECT EXISTS (
                SELECT 1 FROM public.appointments
                WHERE (staff_id = OLD.employee_id OR assigned_employee_id = OLD.employee_id)
                  AND status IN ('scheduled', 'confirmed')
                  AND (date > salon_now_date OR (date = salon_now_date AND end_time > salon_now_time))
            ) INTO has_blocking;

            IF has_blocking THEN
                RAISE EXCEPTION 'Cannot delete this employee because an upcoming or active appointment exists for this employee.';
            END IF;
        END IF;

        -- Check last owner protection with row-level lock against concurrent deletion
        IF OLD.role = 'OWNER' THEN
            PERFORM 1 FROM public.users WHERE role = 'OWNER' FOR UPDATE;

            SELECT COUNT(*) INTO remaining_owners
            FROM public.users
            WHERE role = 'OWNER' AND active = true AND id != OLD.id;

            IF remaining_owners = 0 THEN
                RAISE EXCEPTION 'Cannot delete the last owner account.';
            END IF;
        END IF;

        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.role = 'OWNER' AND (NEW.role != 'OWNER' OR NEW.active = false) THEN
            PERFORM 1 FROM public.users WHERE role = 'OWNER' FOR UPDATE;

            SELECT COUNT(*) INTO remaining_owners
            FROM public.users
            WHERE role = 'OWNER' AND active = true AND id != OLD.id;

            IF remaining_owners = 0 THEN
                RAISE EXCEPTION 'Cannot deactivate or change the role of the last owner account.';
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."fn_check_last_owner_protection"() OWNER TO "postgres";

--
-- Name: fn_check_service_deletion_protection(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."fn_check_service_deletion_protection"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
    salon_now_date DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
    salon_now_time TIME := (now() AT TIME ZONE 'Asia/Kolkata')::time;
    has_blocking BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.appointments
        WHERE service_id = OLD.id
          AND status IN ('scheduled', 'confirmed')
          AND (date > salon_now_date OR (date = salon_now_date AND end_time > salon_now_time))
    ) INTO has_blocking;

    IF has_blocking THEN
        RAISE EXCEPTION 'Cannot delete this service because an upcoming or active appointment exists for this service.';
    END IF;

    -- Snapshot details on historical appointments before foreign key is set null
    UPDATE public.appointments
    SET service_name = COALESCE(service_name, OLD.name)
    WHERE service_id = OLD.id;

    RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."fn_check_service_deletion_protection"() OWNER TO "postgres";

--
-- Name: fn_check_staff_deletion_protection(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."fn_check_staff_deletion_protection"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
    salon_now_date DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
    salon_now_time TIME := (now() AT TIME ZONE 'Asia/Kolkata')::time;
    has_blocking BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.appointments
        WHERE (staff_id = OLD.id OR assigned_employee_id = OLD.id)
          AND status IN ('scheduled', 'confirmed')
          AND (date > salon_now_date OR (date = salon_now_date AND end_time > salon_now_time))
    ) INTO has_blocking;

    IF has_blocking THEN
        RAISE EXCEPTION 'Cannot delete this employee because an upcoming or active appointment exists for this employee.';
    END IF;

    -- Snapshot details on historical appointments before foreign key is set null
    UPDATE public.appointments
    SET staff_name = COALESCE(staff_name, OLD.name)
    WHERE staff_id = OLD.id OR assigned_employee_id = OLD.id;

    RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."fn_check_staff_deletion_protection"() OWNER TO "postgres";

--
-- Name: fn_populate_appointment_snapshots(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."fn_populate_appointment_snapshots"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- Populate client snapshot if empty
    IF NEW.client_name IS NULL AND NEW.client_id IS NOT NULL THEN
        SELECT name, phone, email INTO NEW.client_name, NEW.client_phone, NEW.client_email
        FROM public.clients WHERE id = NEW.client_id;
    END IF;

    -- Populate staff snapshot if empty
    IF NEW.staff_name IS NULL AND NEW.staff_id IS NOT NULL THEN
        SELECT name INTO NEW.staff_name
        FROM public.staff WHERE id = NEW.staff_id;
    END IF;

    -- Populate service snapshot if empty
    IF NEW.service_name IS NULL AND NEW.service_id IS NOT NULL THEN
        SELECT name INTO NEW.service_name
        FROM public.services WHERE id = NEW.service_id;
    END IF;

    -- Ensure assigned_employee_id mirrors staff_id
    IF NEW.assigned_employee_id IS NULL AND NEW.staff_id IS NOT NULL THEN
        NEW.assigned_employee_id := NEW.staff_id;
    END IF;

    NEW.updated_at := timezone('utc'::text, now());
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_populate_appointment_snapshots"() OWNER TO "postgres";

--
-- Name: is_owner(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_owner"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT COALESCE((public.current_user_role() = 'OWNER'), false);
$$;


ALTER FUNCTION "public"."is_owner"() OWNER TO "postgres";

--
-- Name: is_owner_or_receptionist(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_owner_or_receptionist"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT COALESCE((public.current_user_role() IN ('OWNER', 'RECEPTIONIST')), false);
$$;


ALTER FUNCTION "public"."is_owner_or_receptionist"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: appointments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."appointments" (
    "id" "text" NOT NULL,
    "salon_id" "text" NOT NULL,
    "client_id" "text",
    "staff_id" "text",
    "assigned_employee_id" "text",
    "service_id" "text",
    "date" "date" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "status" "text" NOT NULL,
    "price" numeric(10,2) NOT NULL,
    "notes" "text",
    "reminder_sent" boolean DEFAULT false NOT NULL,
    "last_reminder_sent_at" timestamp with time zone,
    "reminder_delivery_status" "text",
    "client_name" "text",
    "client_phone" "text",
    "client_email" "text",
    "staff_name" "text",
    "service_name" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "appointments_price_check" CHECK (("price" >= (0)::numeric)),
    CONSTRAINT "appointments_reminder_delivery_status_check" CHECK (("reminder_delivery_status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'delivered'::"text", 'failed'::"text"]))),
    CONSTRAINT "appointments_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'confirmed'::"text", 'completed'::"text", 'cancelled'::"text", 'no-show'::"text"])))
);


ALTER TABLE "public"."appointments" OWNER TO "postgres";

--
-- Name: clients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."clients" (
    "id" "text" NOT NULL,
    "salon_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "email" "text" NOT NULL,
    "date_of_birth" "date",
    "preferences" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "last_visit_at" timestamp with time zone,
    "total_spend" numeric(10,2) DEFAULT 0.00 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "clients_total_spend_check" CHECK (("total_spend" >= (0)::numeric))
);


ALTER TABLE "public"."clients" OWNER TO "postgres";

--
-- Name: salons; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."salons" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "owner_name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "email" "text" NOT NULL,
    "address" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "timezone" "text" DEFAULT 'Asia/Kolkata'::"text" NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "currency_symbol" "text" DEFAULT '₹'::"text" NOT NULL,
    "language" "text" DEFAULT 'en'::"text" NOT NULL,
    "working_hours" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."salons" OWNER TO "postgres";

--
-- Name: services; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."services" (
    "id" "text" NOT NULL,
    "salon_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "duration" integer NOT NULL,
    "price" numeric(10,2) NOT NULL,
    "category" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "services_duration_check" CHECK (("duration" > 0)),
    CONSTRAINT "services_price_check" CHECK (("price" >= (0)::numeric))
);


ALTER TABLE "public"."services" OWNER TO "postgres";

--
-- Name: staff; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."staff" (
    "id" "text" NOT NULL,
    "salon_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" NOT NULL,
    "skills" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "experience" "text" DEFAULT ''::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "working_hours" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "staff_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'master_stylist'::"text", 'senior_stylist'::"text", 'colorist'::"text", 'junior_stylist'::"text"])))
);


ALTER TABLE "public"."staff" OWNER TO "postgres";

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."users" (
    "id" "text" NOT NULL,
    "salon_id" "text" NOT NULL,
    "auth_user_id" "uuid",
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" NOT NULL,
    "employee_id" "text",
    "specialty" "text",
    "active" boolean DEFAULT true NOT NULL,
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "users_role_check" CHECK (("role" = ANY (ARRAY['OWNER'::"text", 'RECEPTIONIST'::"text", 'EMPLOYEE'::"text"])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";

--
-- Data for Name: appointments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."appointments" ("id", "salon_id", "client_id", "staff_id", "assigned_employee_id", "service_id", "date", "start_time", "end_time", "status", "price", "notes", "reminder_sent", "last_reminder_sent_at", "reminder_delivery_status", "client_name", "client_phone", "client_email", "staff_name", "service_name", "created_at", "updated_at") FROM stdin;
apt-01	salon-luma-01	cli-12	staff-01	staff-01	srv-01	2026-10-17	09:00:00	09:45:00	completed	600.00	Client requested subtle curtain bangs and root lift.	f	\N	\N	Nisha Gupta	\N	\N	Mia Vance	Haircut & Blowdry	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
apt-02	salon-luma-01	cli-02	staff-04	staff-04	srv-01	2026-10-17	10:15:00	11:00:00	completed	600.00	Classic taper cut on sides with textured top.	f	\N	\N	Rahul Sethi	\N	\N	Kabir Sharma	Haircut & Blowdry	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
apt-03	salon-luma-01	cli-01	staff-02	staff-02	srv-04	2026-10-17	11:30:00	14:30:00	confirmed	4500.00	Warm caramel balayage refresh with bonding treatment.	f	\N	\N	Priya Sharma	\N	\N	Rohan Sen	Balayage & Toning	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
apt-04	salon-luma-01	cli-14	staff-01	staff-01	srv-03	2026-10-17	14:45:00	16:15:00	confirmed	2500.00	New client consultation + rich chocolate global color.	f	\N	\N	Sakshi Arora	\N	\N	Mia Vance	Global Hair Color	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
apt-05	salon-luma-01	cli-03	staff-04	staff-04	srv-02	2026-10-17	16:30:00	17:30:00	scheduled	1200.00	Includes steam hydration and scalp therapy.	f	\N	\N	Simran Kaur	\N	\N	Kabir Sharma	Hair Spa & Deep Conditioning	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
apt-06	salon-luma-01	cli-06	staff-03	staff-03	srv-07	2026-10-17	18:00:00	19:00:00	scheduled	1500.00	Herbal facial ritual before weekend destination wedding.	f	\N	\N	Riya Malhotra	\N	\N	Ananya Roy	Radiance Facial Ritual	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
apt-07	salon-luma-01	cli-13	staff-04	staff-04	srv-02	2026-10-16	11:00:00	12:00:00	completed	1200.00	\N	f	\N	\N	Aditi Chawla	\N	\N	Kabir Sharma	Hair Spa & Deep Conditioning	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
apt-08	salon-luma-01	cli-10	staff-01	staff-01	srv-01	2026-10-16	14:00:00	14:45:00	completed	600.00	\N	f	\N	\N	Ishita Bansal	\N	\N	Mia Vance	Haircut & Blowdry	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
apt-09	salon-luma-01	cli-08	staff-04	staff-04	srv-01	2026-10-15	15:30:00	16:15:00	cancelled	600.00	Client informed 3 hours prior due to urgent office travel.	f	\N	\N	Mehak Arora	\N	\N	Kabir Sharma	Haircut & Blowdry	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
apt-10	salon-luma-01	cli-05	staff-04	staff-04	srv-01	2026-10-14	16:00:00	16:45:00	no-show	600.00	Did not respond to WhatsApp confirmation or reminder call.	f	\N	\N	Aarav Singh	\N	\N	Kabir Sharma	Haircut & Blowdry	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
apt-11	salon-luma-01	cli-09	staff-03	staff-03	srv-02	2026-10-13	13:00:00	14:00:00	completed	1200.00	\N	f	\N	\N	Kavya Mehta	\N	\N	Ananya Roy	Hair Spa & Deep Conditioning	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
apt-12	salon-luma-01	cli-04	staff-02	staff-02	srv-05	2026-10-18	10:30:00	13:00:00	confirmed	5500.00	Rebooked after smart reminder outreach. Send confirmation.	f	\N	\N	Ananya Kapoor	\N	\N	Rohan Sen	Keratin Treatment	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
apt-13	salon-luma-01	cli-07	staff-01	staff-01	srv-01	2026-10-18	14:00:00	14:45:00	confirmed	600.00	Include gentle scalp massage.	f	\N	\N	Neha Verma	\N	\N	Mia Vance	Haircut & Blowdry	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
apt-14	salon-luma-01	cli-11	staff-02	staff-02	srv-03	2026-10-19	11:00:00	12:30:00	scheduled	2500.00	\N	f	\N	\N	Pooja Khanna	\N	\N	Rohan Sen	Global Hair Color	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
apt-15	salon-luma-01	cli-01	staff-01	staff-01	srv-08	2026-10-20	15:00:00	15:40:00	scheduled	700.00	Nude pink gel finish.	f	\N	\N	Priya Sharma	\N	\N	Mia Vance	Classic Manicure	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
apt-16	salon-luma-01	cli-02	staff-04	staff-04	srv-09	2026-10-21	12:00:00	12:45:00	scheduled	800.00	\N	f	\N	\N	Rahul Sethi	\N	\N	Kabir Sharma	Deluxe Pedicure	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
apt-17	salon-luma-01	cli-06	staff-03	staff-03	srv-10	2026-10-22	13:00:00	15:00:00	confirmed	6000.00	Full row adjustment and styling.	f	\N	\N	Riya Malhotra	\N	\N	Ananya Roy	Hair Extensions Application	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
apt-18	salon-luma-01	cli-10	staff-01	staff-01	srv-01	2026-10-23	15:00:00	15:45:00	scheduled	600.00	\N	f	\N	\N	Ishita Bansal	\N	\N	Mia Vance	Haircut & Blowdry	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
\.


--
-- Data for Name: clients; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."clients" ("id", "salon_id", "name", "phone", "email", "date_of_birth", "preferences", "notes", "created_at", "last_visit_at", "total_spend", "updated_at") FROM stdin;
cli-01	salon-luma-01	Priya Sharma	+91 98765 11001	priya.sharma@example.com	1992-04-18	{"notes": "Loves caramel balayage; prefers quiet morning appointments.", "hairType": "Thick, wavy, color-treated", "allergies": "None", "preferredBeverage": "Masala Chai", "preferredStylistId": "staff-01"}	Loyal VIP client for 3 years. Books regular maintenance every 6 weeks.	2026-10-17 14:22:45.766267+00	2026-10-11 00:00:00+00	18500.00	2026-10-17 14:22:45.766267+00
cli-02	salon-luma-01	Rahul Sethi	+91 98765 11002	rahul.sethi@example.com	1988-11-23	{"notes": "Fade cut on sides, scissor trim on top. Always punctual.", "hairType": "Thick, straight", "preferredBeverage": "Green Tea", "preferredStylistId": "staff-04"}	Visits every 3 weeks for grooming and haircut.	2026-10-17 14:22:45.766267+00	2026-10-05 00:00:00+00	4800.00	2026-10-17 14:22:45.766267+00
cli-03	salon-luma-01	Simran Kaur	+91 98765 11003	simran.kaur@example.com	1995-08-04	{"notes": "Regular hair spa client; prefers gentle scalp pressure.", "hairType": "Dense, long, naturally wavy", "preferredBeverage": "Ginger Lemon Tea", "preferredStylistId": "staff-04"}	High attention to organic and ammonia-free products.	2026-10-17 14:22:45.766267+00	2026-09-29 00:00:00+00	9200.00	2026-10-17 14:22:45.766267+00
cli-04	salon-luma-01	Ananya Kapoor	+91 98765 11004	ananya.kapoor@example.com	1984-02-14	{"notes": "Keratin smoothing enthusiast; likes cool ash tone balayage.", "hairType": "Medium density, frizzy, colored", "allergies": "Mild lavender fragrance sensitivity", "preferredBeverage": "Cold Coffee", "preferredStylistId": "staff-02"}	VIP client. Has not visited in over 2 months. Primary candidate for rebooking.	2026-10-17 14:22:45.766267+00	2026-08-06 00:00:00+00	24000.00	2026-10-17 14:22:45.766267+00
cli-05	salon-luma-01	Aarav Singh	+91 98765 11005	aarav.singh@example.com	1979-09-30	{"hairType": "Coarse, graying at temples", "preferredBeverage": "Espresso", "preferredStylistId": "staff-04"}	Executive haircut; usually schedules after 6 PM.	2026-10-17 14:22:45.766267+00	2026-08-13 00:00:00+00	3600.00	2026-10-17 14:22:45.766267+00
cli-06	salon-luma-01	Riya Malhotra	+91 98765 11006	riya.malhotra@example.com	1998-12-10	{"notes": "Vivid toner and gloss melts; asks for post-color protein mask.", "hairType": "Fine, bleached, long", "preferredBeverage": "Iced Green Tea", "preferredStylistId": "staff-03"}	Regularly shares salon reviews and stories on social media.	2026-10-17 14:22:45.766267+00	2026-09-19 00:00:00+00	16200.00	2026-10-17 14:22:45.766267+00
cli-07	salon-luma-01	Neha Verma	+91 98765 11007	neha.verma@example.com	1976-06-17	{"notes": "Requires gentle blowdry with heat shield.", "hairType": "Fine texture, prone to breakage", "preferredBeverage": "Hot Water with Honey and Lemon", "preferredStylistId": "staff-01"}	Senior corporate client. Has not booked in 85 days.	2026-10-17 14:22:45.766267+00	2026-07-24 00:00:00+00	28500.00	2026-10-17 14:22:45.766267+00
cli-08	salon-luma-01	Mehak Arora	+91 98765 11008	mehak.arora@example.com	1991-03-25	{"hairType": "Silky, straight", "preferredBeverage": "Filter Coffee", "preferredStylistId": "staff-04"}	Prefers quick haircut sessions during weekday afternoons.	2026-10-17 14:22:45.766267+00	2026-07-14 00:00:00+00	5400.00	2026-10-17 14:22:45.766267+00
cli-09	salon-luma-01	Kavya Mehta	+91 98765 11009	kavya.mehta@example.com	2001-07-09	{"notes": "Loves golden honey tones.", "hairType": "Wavy, medium, highlights", "preferredBeverage": "Lemon Ice Tea", "preferredStylistId": "staff-03"}	College student, usually visits on weekends.	2026-10-17 14:22:45.766267+00	2026-09-12 00:00:00+00	8100.00	2026-10-17 14:22:45.766267+00
cli-10	salon-luma-01	Ishita Bansal	+91 98765 11010	ishita.bansal@example.com	1985-05-12	{"hairType": "Medium curly, dry ends", "preferredBeverage": "Sparkling Water", "preferredStylistId": "staff-01"}	Always books haircut with deep hair spa.	2026-10-17 14:22:45.766267+00	2026-10-03 00:00:00+00	6700.00	2026-10-17 14:22:45.766267+00
cli-11	salon-luma-01	Pooja Khanna	+91 98765 11011	pooja.khanna@example.com	1993-10-28	{"notes": "Subtle chocolate brown global color with gloss.", "hairType": "Long, straight, thick", "preferredBeverage": "Cappuccino", "preferredStylistId": "staff-02"}	Referred by Priya Sharma.	2026-10-17 14:22:45.766267+00	2026-09-05 00:00:00+00	7900.00	2026-10-17 14:22:45.766267+00
cli-12	salon-luma-01	Nisha Gupta	+91 98765 11012	nisha.gupta@example.com	1990-01-19	{"hairType": "Shoulder length, straight", "preferredBeverage": "Warm Water", "preferredStylistId": "staff-01"}	Prefers curtain bangs and volume round-brush styling.	2026-10-17 14:22:45.766267+00	2026-10-14 00:00:00+00	2400.00	2026-10-17 14:22:45.766267+00
cli-13	salon-luma-01	Aditi Chawla	+91 98765 11013	aditi.chawla@example.com	1987-08-16	{"hairType": "Curly, coarse", "preferredBeverage": "Peach Iced Tea", "preferredStylistId": "staff-04"}	Interested in seasonal scalp detox treatments.	2026-10-17 14:22:45.766267+00	2026-10-16 00:00:00+00	1500.00	2026-10-17 14:22:45.766267+00
cli-14	salon-luma-01	Sakshi Arora	+91 98765 11014	sakshi.arora@example.com	1996-12-03	{"hairType": "Wavy, fine, blonde highlights", "preferredBeverage": "Cold Coffee with Almond Milk", "preferredStylistId": "staff-01"}	First time booking online. Inquired about global color & gloss.	2026-10-17 14:22:45.766267+00	\N	0.00	2026-10-17 14:22:45.766267+00
\.


--
-- Data for Name: salons; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."salons" ("id", "name", "owner_name", "phone", "email", "address", "timezone", "currency", "currency_symbol", "language", "working_hours", "created_at", "updated_at") FROM stdin;
salon-luma-01	Luma Salon	Mia	+91 98765 43210	contact@lumasalon.example.com	{}	Asia/Kolkata	INR	₹	en	{}	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
\.


--
-- Data for Name: services; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."services" ("id", "salon_id", "name", "description", "duration", "price", "category", "active", "created_at", "updated_at") FROM stdin;
srv-01	salon-luma-01	Haircut & Blowdry	Personalized consultation, scalp cleanse, precision haircut tailored to hair texture, and signature blowout.	45	600.00	haircut	t	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
srv-02	salon-luma-01	Hair Spa & Deep Conditioning	Intense steam hydration mask, Ayurvedic scalp revitalization, and deep moisture repair.	60	1200.00	treatment	t	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
srv-03	salon-luma-01	Global Hair Color	Complete rich root-to-tip permanent or demi-permanent color formulation with luminous gloss glaze.	90	2500.00	color	t	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
srv-04	salon-luma-01	Balayage & Toning	Hand-painted dimensional highlights customized to facial contours with balancing gloss and bonding shield.	180	4500.00	color	t	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
srv-05	salon-luma-01	Keratin Treatment	Deep anti-frizz protein bonding therapy that aligns the hair cuticle for silky, frizz-free texture.	150	5500.00	treatment	t	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
srv-06	salon-luma-01	Hair Smoothening	Thermal cuticle restructuring and shine sealing for long-lasting, pin-straight, glossy hair.	150	4500.00	treatment	t	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
srv-07	salon-luma-01	Radiance Facial Ritual	Gentle clarifying steam, enzymatic scrub, lymphatic facial massage, and brightening botanical mask.	60	1500.00	styling	t	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
srv-08	salon-luma-01	Classic Manicure	Nail shaping, cuticle treatment, gentle exfoliating scrub, hand massage, and professional lacquer finish.	40	700.00	styling	t	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
srv-09	salon-luma-01	Deluxe Pedicure	Aromatherapy foot soak, callus softening, exfoliating scrub, massage, and long-wear nail polish.	45	800.00	styling	t	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
srv-10	salon-luma-01	Hair Extensions Application	Premium seamless weft or tape-in extensions adjustment, natural blending cut, and thermal styling.	120	6000.00	extensions	t	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
\.


--
-- Data for Name: staff; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."staff" ("id", "salon_id", "name", "phone", "email", "role", "skills", "experience", "active", "working_hours", "avatar_url", "created_at", "updated_at") FROM stdin;
staff-01	salon-luma-01	Mia Vance	+91 98111 22334	mia@lumasalon.example.com	owner	{"Precision Cut","Balayage Specialist","Bridal Styling","Color Correction"}	11 years	t	{"friday": {"open": "10:00", "close": "21:00", "isOpen": true}, "monday": {"open": "10:00", "close": "20:00", "isOpen": true}, "sunday": {"open": "10:00", "close": "20:00", "isOpen": true}, "tuesday": {"open": "10:00", "close": "20:00", "isOpen": true}, "saturday": {"open": "09:30", "close": "21:00", "isOpen": true}, "thursday": {"open": "10:00", "close": "20:00", "isOpen": true}, "wednesday": {"open": "10:00", "close": "20:00", "isOpen": true}}	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
staff-02	salon-luma-01	Rohan Sen	+91 98111 33445	rohan@lumasalon.example.com	senior_stylist	{"Balayage & Foils","Blonde & Toning",Haircut,Smoothening}	7 years	t	{"friday": {"open": "10:00", "close": "21:00", "isOpen": true}, "monday": {"open": "10:00", "close": "20:00", "isOpen": true}, "sunday": {"open": "10:00", "close": "20:00", "isOpen": true}, "tuesday": {"open": "10:00", "close": "20:00", "isOpen": true}, "saturday": {"open": "09:30", "close": "21:00", "isOpen": true}, "thursday": {"open": "10:00", "close": "20:00", "isOpen": true}, "wednesday": {"open": "10:00", "close": "20:00", "isOpen": true}}	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
staff-03	salon-luma-01	Ananya Roy	+91 98111 44556	ananya@lumasalon.example.com	colorist	{"Global Hair Color","Radiance Facial","Scalp Therapy","Keratin Treatment"}	6 years	t	{"friday": {"open": "10:00", "close": "21:00", "isOpen": true}, "monday": {"open": "10:00", "close": "20:00", "isOpen": true}, "sunday": {"open": "10:00", "close": "20:00", "isOpen": true}, "tuesday": {"open": "10:00", "close": "20:00", "isOpen": true}, "saturday": {"open": "09:30", "close": "21:00", "isOpen": true}, "thursday": {"open": "10:00", "close": "20:00", "isOpen": true}, "wednesday": {"open": "10:00", "close": "20:00", "isOpen": true}}	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
staff-04	salon-luma-01	Kabir Sharma	+91 98111 55667	kabir@lumasalon.example.com	junior_stylist	{"Hair Spa Rituals","Texture Styling","Classic Manicure",Pedicure}	4 years	t	{"friday": {"open": "10:00", "close": "21:00", "isOpen": true}, "monday": {"open": "10:00", "close": "20:00", "isOpen": true}, "sunday": {"open": "10:00", "close": "20:00", "isOpen": true}, "tuesday": {"open": "10:00", "close": "20:00", "isOpen": true}, "saturday": {"open": "09:30", "close": "21:00", "isOpen": true}, "thursday": {"open": "10:00", "close": "20:00", "isOpen": true}, "wednesday": {"open": "10:00", "close": "20:00", "isOpen": true}}	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
staff-05	salon-luma-01	Pooja Patel	+91 98111 66778	pooja@lumasalon.example.com	senior_stylist	{"Haircut & Blowdry","Balayage & Toning","Hair Spa"}	5 years	t	{"friday": {"open": "10:00", "close": "21:00", "isOpen": true}, "monday": {"open": "10:00", "close": "20:00", "isOpen": true}, "sunday": {"open": "10:00", "close": "20:00", "isOpen": true}, "tuesday": {"open": "10:00", "close": "20:00", "isOpen": true}, "saturday": {"open": "09:30", "close": "21:00", "isOpen": true}, "thursday": {"open": "10:00", "close": "20:00", "isOpen": true}, "wednesday": {"open": "10:00", "close": "20:00", "isOpen": true}}	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
staff-06	salon-luma-01	Vikram Malhotra	+91 98111 77889	vikram@lumasalon.example.com	master_stylist	{"Precision Cut","Global Hair Color","Keratin Treatment"}	8 years	t	{"friday": {"open": "10:00", "close": "21:00", "isOpen": true}, "monday": {"open": "10:00", "close": "20:00", "isOpen": true}, "sunday": {"open": "10:00", "close": "20:00", "isOpen": true}, "tuesday": {"open": "10:00", "close": "20:00", "isOpen": true}, "saturday": {"open": "09:30", "close": "21:00", "isOpen": true}, "thursday": {"open": "10:00", "close": "20:00", "isOpen": true}, "wednesday": {"open": "10:00", "close": "20:00", "isOpen": true}}	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
staff-07	salon-luma-01	Sneha Reddy	+91 98111 88990	sneha@lumasalon.example.com	colorist	{"Radiance Facial","Scalp Therapy","Skin Glow"}	4 years	t	{"friday": {"open": "10:00", "close": "21:00", "isOpen": true}, "monday": {"open": "10:00", "close": "20:00", "isOpen": true}, "sunday": {"open": "10:00", "close": "20:00", "isOpen": true}, "tuesday": {"open": "10:00", "close": "20:00", "isOpen": true}, "saturday": {"open": "09:30", "close": "21:00", "isOpen": true}, "thursday": {"open": "10:00", "close": "20:00", "isOpen": true}, "wednesday": {"open": "10:00", "close": "20:00", "isOpen": true}}	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
staff-08	salon-luma-01	Arjun Kapoor	+91 98111 99001	arjun@lumasalon.example.com	senior_stylist	{"Haircut & Blowdry","Texture Styling",Balayage}	6 years	t	{"friday": {"open": "10:00", "close": "21:00", "isOpen": true}, "monday": {"open": "10:00", "close": "20:00", "isOpen": true}, "sunday": {"open": "10:00", "close": "20:00", "isOpen": true}, "tuesday": {"open": "10:00", "close": "20:00", "isOpen": true}, "saturday": {"open": "09:30", "close": "21:00", "isOpen": true}, "thursday": {"open": "10:00", "close": "20:00", "isOpen": true}, "wednesday": {"open": "10:00", "close": "20:00", "isOpen": true}}	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
staff-09	salon-luma-01	Divya Nair	+91 98112 00112	divya@lumasalon.example.com	junior_stylist	{"Classic Manicure",Pedicure,"Nail Art","Gel Polish"}	3 years	t	{"friday": {"open": "10:00", "close": "21:00", "isOpen": true}, "monday": {"open": "10:00", "close": "20:00", "isOpen": true}, "sunday": {"open": "10:00", "close": "20:00", "isOpen": true}, "tuesday": {"open": "10:00", "close": "20:00", "isOpen": true}, "saturday": {"open": "09:30", "close": "21:00", "isOpen": true}, "thursday": {"open": "10:00", "close": "20:00", "isOpen": true}, "wednesday": {"open": "10:00", "close": "20:00", "isOpen": true}}	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
staff-10	salon-luma-01	Karan Verma	+91 98112 11223	karan@lumasalon.example.com	senior_stylist	{"Balayage & Foils","Blonde & Toning",Haircut}	5 years	t	{"friday": {"open": "10:00", "close": "21:00", "isOpen": true}, "monday": {"open": "10:00", "close": "20:00", "isOpen": true}, "sunday": {"open": "10:00", "close": "20:00", "isOpen": true}, "tuesday": {"open": "10:00", "close": "20:00", "isOpen": true}, "saturday": {"open": "09:30", "close": "21:00", "isOpen": true}, "thursday": {"open": "10:00", "close": "20:00", "isOpen": true}, "wednesday": {"open": "10:00", "close": "20:00", "isOpen": true}}	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
staff-11	salon-luma-01	Meera Joshi	+91 98112 22334	meera@lumasalon.example.com	colorist	{"Radiance Facial","Deep Cleansing","Scalp Therapy"}	5 years	t	{"friday": {"open": "10:00", "close": "21:00", "isOpen": true}, "monday": {"open": "10:00", "close": "20:00", "isOpen": true}, "sunday": {"open": "10:00", "close": "20:00", "isOpen": true}, "tuesday": {"open": "10:00", "close": "20:00", "isOpen": true}, "saturday": {"open": "09:30", "close": "21:00", "isOpen": true}, "thursday": {"open": "10:00", "close": "20:00", "isOpen": true}, "wednesday": {"open": "10:00", "close": "20:00", "isOpen": true}}	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
staff-12	salon-luma-01	Siddharth Rao	+91 98112 33445	siddharth@lumasalon.example.com	master_stylist	{"Haircut & Blowdry","Keratin Treatment","Balayage Specialist"}	7 years	t	{"friday": {"open": "10:00", "close": "21:00", "isOpen": true}, "monday": {"open": "10:00", "close": "20:00", "isOpen": true}, "sunday": {"open": "10:00", "close": "20:00", "isOpen": true}, "tuesday": {"open": "10:00", "close": "20:00", "isOpen": true}, "saturday": {"open": "09:30", "close": "21:00", "isOpen": true}, "thursday": {"open": "10:00", "close": "20:00", "isOpen": true}, "wednesday": {"open": "10:00", "close": "20:00", "isOpen": true}}	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
staff-13	salon-luma-01	Riya Sen	+91 98112 44556	riya@lumasalon.example.com	junior_stylist	{"Classic Manicure",Pedicure,"Nail Art"}	2 years	t	{"friday": {"open": "10:00", "close": "21:00", "isOpen": true}, "monday": {"open": "10:00", "close": "20:00", "isOpen": true}, "sunday": {"open": "10:00", "close": "20:00", "isOpen": true}, "tuesday": {"open": "10:00", "close": "20:00", "isOpen": true}, "saturday": {"open": "09:30", "close": "21:00", "isOpen": true}, "thursday": {"open": "10:00", "close": "20:00", "isOpen": true}, "wednesday": {"open": "10:00", "close": "20:00", "isOpen": true}}	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
staff-14	salon-luma-01	Aditya Singhania	+91 98112 55667	aditya@lumasalon.example.com	senior_stylist	{"Global Hair Color","Hair Spa & Deep Conditioning",Haircut}	5 years	t	{"friday": {"open": "10:00", "close": "21:00", "isOpen": true}, "monday": {"open": "10:00", "close": "20:00", "isOpen": true}, "sunday": {"open": "10:00", "close": "20:00", "isOpen": true}, "tuesday": {"open": "10:00", "close": "20:00", "isOpen": true}, "saturday": {"open": "09:30", "close": "21:00", "isOpen": true}, "thursday": {"open": "10:00", "close": "20:00", "isOpen": true}, "wednesday": {"open": "10:00", "close": "20:00", "isOpen": true}}	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
staff-15	salon-luma-01	Tanvi Deshmukh	+91 98112 66778	tanvi@lumasalon.example.com	colorist	{"Radiance Facial","Skin Glow","Ayurvedic Rituals"}	4 years	t	{"friday": {"open": "10:00", "close": "21:00", "isOpen": true}, "monday": {"open": "10:00", "close": "20:00", "isOpen": true}, "sunday": {"open": "10:00", "close": "20:00", "isOpen": true}, "tuesday": {"open": "10:00", "close": "20:00", "isOpen": true}, "saturday": {"open": "09:30", "close": "21:00", "isOpen": true}, "thursday": {"open": "10:00", "close": "20:00", "isOpen": true}, "wednesday": {"open": "10:00", "close": "20:00", "isOpen": true}}	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
staff-16	salon-luma-01	Manish Gupta	+91 98112 77889	manish@lumasalon.example.com	junior_stylist	{"Hair Spa Rituals","Texture Styling","Haircut & Blowdry"}	3 years	t	{"friday": {"open": "10:00", "close": "21:00", "isOpen": true}, "monday": {"open": "10:00", "close": "20:00", "isOpen": true}, "sunday": {"open": "10:00", "close": "20:00", "isOpen": true}, "tuesday": {"open": "10:00", "close": "20:00", "isOpen": true}, "saturday": {"open": "09:30", "close": "21:00", "isOpen": true}, "thursday": {"open": "10:00", "close": "20:00", "isOpen": true}, "wednesday": {"open": "10:00", "close": "20:00", "isOpen": true}}	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
staff-17	salon-luma-01	Kavita Iyer	+91 98112 88990	kavita@lumasalon.example.com	senior_stylist	{"Classic Manicure",Pedicure,"Gel Extensions"}	6 years	t	{"friday": {"open": "10:00", "close": "21:00", "isOpen": true}, "monday": {"open": "10:00", "close": "20:00", "isOpen": true}, "sunday": {"open": "10:00", "close": "20:00", "isOpen": true}, "tuesday": {"open": "10:00", "close": "20:00", "isOpen": true}, "saturday": {"open": "09:30", "close": "21:00", "isOpen": true}, "thursday": {"open": "10:00", "close": "20:00", "isOpen": true}, "wednesday": {"open": "10:00", "close": "20:00", "isOpen": true}}	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
staff-18	salon-luma-01	Nikhil Bhatia	+91 98112 99001	nikhil@lumasalon.example.com	senior_stylist	{"Haircut & Blowdry","Balayage & Toning",Smoothening}	5 years	t	{"friday": {"open": "10:00", "close": "21:00", "isOpen": true}, "monday": {"open": "10:00", "close": "20:00", "isOpen": true}, "sunday": {"open": "10:00", "close": "20:00", "isOpen": true}, "tuesday": {"open": "10:00", "close": "20:00", "isOpen": true}, "saturday": {"open": "09:30", "close": "21:00", "isOpen": true}, "thursday": {"open": "10:00", "close": "20:00", "isOpen": true}, "wednesday": {"open": "10:00", "close": "20:00", "isOpen": true}}	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
staff-19	salon-luma-01	Ishita Dutta	+91 98113 00112	ishita@lumasalon.example.com	colorist	{"Scalp Therapy","Radiance Facial","Ayurvedic Rituals"}	4 years	t	{"friday": {"open": "10:00", "close": "21:00", "isOpen": true}, "monday": {"open": "10:00", "close": "20:00", "isOpen": true}, "sunday": {"open": "10:00", "close": "20:00", "isOpen": true}, "tuesday": {"open": "10:00", "close": "20:00", "isOpen": true}, "saturday": {"open": "09:30", "close": "21:00", "isOpen": true}, "thursday": {"open": "10:00", "close": "20:00", "isOpen": true}, "wednesday": {"open": "10:00", "close": "20:00", "isOpen": true}}	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
staff-20	salon-luma-01	Varun Dhawan	+91 98113 11223	varun@lumasalon.example.com	junior_stylist	{"Haircut & Blowdry","Texture Styling","Hair Spa"}	2 years	t	{"friday": {"open": "10:00", "close": "21:00", "isOpen": true}, "monday": {"open": "10:00", "close": "20:00", "isOpen": true}, "sunday": {"open": "10:00", "close": "20:00", "isOpen": true}, "tuesday": {"open": "10:00", "close": "20:00", "isOpen": true}, "saturday": {"open": "09:30", "close": "21:00", "isOpen": true}, "thursday": {"open": "10:00", "close": "20:00", "isOpen": true}, "wednesday": {"open": "10:00", "close": "20:00", "isOpen": true}}	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."users" ("id", "salon_id", "auth_user_id", "name", "email", "role", "employee_id", "specialty", "active", "avatar_url", "created_at", "updated_at") FROM stdin;
user-owner-01	salon-luma-01	\N	Owner 1	owner1@lumasalon.example.com	OWNER	\N	\N	t	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
user-owner-02	salon-luma-01	\N	Owner 2	owner2@lumasalon.example.com	OWNER	\N	\N	t	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
user-rec-01	salon-luma-01	\N	Receptionist 1	receptionist@lumasalon.example.com	RECEPTIONIST	\N	\N	t	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
user-emp-01	salon-luma-01	\N	Mia Vance	mia@lumasalon.example.com	EMPLOYEE	staff-01	Hair	t	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
user-emp-02	salon-luma-01	\N	Rohan Sen	rohan@lumasalon.example.com	EMPLOYEE	staff-02	Hair	t	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
user-emp-03	salon-luma-01	\N	Ananya Roy	ananya@lumasalon.example.com	EMPLOYEE	staff-03	Skin	t	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
user-emp-04	salon-luma-01	\N	Kabir Sharma	kabir@lumasalon.example.com	EMPLOYEE	staff-04	Nail	t	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
user-emp-05	salon-luma-01	\N	Pooja Patel	pooja@lumasalon.example.com	EMPLOYEE	staff-05	Hair	t	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
user-emp-06	salon-luma-01	\N	Vikram Malhotra	vikram@lumasalon.example.com	EMPLOYEE	staff-06	Hair	t	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
user-emp-07	salon-luma-01	\N	Sneha Reddy	sneha@lumasalon.example.com	EMPLOYEE	staff-07	Skin	t	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
user-emp-08	salon-luma-01	\N	Arjun Kapoor	arjun@lumasalon.example.com	EMPLOYEE	staff-08	Hair	t	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
user-emp-09	salon-luma-01	\N	Divya Nair	divya@lumasalon.example.com	EMPLOYEE	staff-09	Nail	t	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
user-emp-10	salon-luma-01	\N	Karan Verma	karan@lumasalon.example.com	EMPLOYEE	staff-10	Hair	t	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
user-emp-11	salon-luma-01	\N	Meera Joshi	meera@lumasalon.example.com	EMPLOYEE	staff-11	Skin	t	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
user-emp-12	salon-luma-01	\N	Siddharth Rao	siddharth@lumasalon.example.com	EMPLOYEE	staff-12	Hair	t	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
user-emp-13	salon-luma-01	\N	Riya Sen	riya@lumasalon.example.com	EMPLOYEE	staff-13	Nail	t	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
user-emp-14	salon-luma-01	\N	Aditya Singhania	aditya@lumasalon.example.com	EMPLOYEE	staff-14	Hair	t	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
user-emp-15	salon-luma-01	\N	Tanvi Deshmukh	tanvi@lumasalon.example.com	EMPLOYEE	staff-15	Skin	t	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
user-emp-16	salon-luma-01	\N	Manish Gupta	manish@lumasalon.example.com	EMPLOYEE	staff-16	Hair	t	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
user-emp-17	salon-luma-01	\N	Kavita Iyer	kavita@lumasalon.example.com	EMPLOYEE	staff-17	Nail	t	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
user-emp-18	salon-luma-01	\N	Nikhil Bhatia	nikhil@lumasalon.example.com	EMPLOYEE	staff-18	Hair	t	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
user-emp-19	salon-luma-01	\N	Ishita Dutta	ishita@lumasalon.example.com	EMPLOYEE	staff-19	Skin	t	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
user-emp-20	salon-luma-01	\N	Varun Dhawan	varun@lumasalon.example.com	EMPLOYEE	staff-20	Hair	t	\N	2026-10-17 14:22:45.766267+00	2026-10-17 14:22:45.766267+00
\.


--
-- Name: appointments appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");


--
-- Name: salons salons_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."salons"
    ADD CONSTRAINT "salons_pkey" PRIMARY KEY ("id");


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");


--
-- Name: staff staff_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_pkey" PRIMARY KEY ("id");


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");


--
-- Name: idx_appointments_client_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_appointments_client_id" ON "public"."appointments" USING "btree" ("client_id");


--
-- Name: idx_appointments_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_appointments_date" ON "public"."appointments" USING "btree" ("date");


--
-- Name: idx_appointments_salon_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_appointments_salon_id" ON "public"."appointments" USING "btree" ("salon_id");


--
-- Name: idx_appointments_service_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_appointments_service_id" ON "public"."appointments" USING "btree" ("service_id");


--
-- Name: idx_appointments_staff_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_appointments_staff_date" ON "public"."appointments" USING "btree" ("staff_id", "date");


--
-- Name: idx_appointments_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_appointments_status" ON "public"."appointments" USING "btree" ("status");


--
-- Name: idx_clients_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_clients_email" ON "public"."clients" USING "btree" ("email");


--
-- Name: idx_clients_phone; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_clients_phone" ON "public"."clients" USING "btree" ("phone");


--
-- Name: idx_clients_salon_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_clients_salon_id" ON "public"."clients" USING "btree" ("salon_id");


--
-- Name: idx_services_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_services_active" ON "public"."services" USING "btree" ("active");


--
-- Name: idx_services_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_services_category" ON "public"."services" USING "btree" ("category");


--
-- Name: idx_services_salon_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_services_salon_id" ON "public"."services" USING "btree" ("salon_id");


--
-- Name: idx_staff_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_staff_active" ON "public"."staff" USING "btree" ("active");


--
-- Name: idx_staff_salon_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_staff_salon_id" ON "public"."staff" USING "btree" ("salon_id");


--
-- Name: idx_users_auth_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_users_auth_user_id" ON "public"."users" USING "btree" ("auth_user_id");


--
-- Name: idx_users_auth_user_id_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_users_auth_user_id_unique" ON "public"."users" USING "btree" ("auth_user_id") WHERE ("auth_user_id" IS NOT NULL);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_users_email" ON "public"."users" USING "btree" ("email");


--
-- Name: idx_users_employee_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_users_employee_id" ON "public"."users" USING "btree" ("employee_id");


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_users_role" ON "public"."users" USING "btree" ("role");


--
-- Name: clients trg_check_client_deletion_protection; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_check_client_deletion_protection" BEFORE DELETE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."fn_check_client_deletion_protection"();


--
-- Name: users trg_check_last_owner_protection; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_check_last_owner_protection" BEFORE DELETE OR UPDATE OF "role", "active" ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."fn_check_last_owner_protection"();


--
-- Name: services trg_check_service_deletion_protection; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_check_service_deletion_protection" BEFORE DELETE ON "public"."services" FOR EACH ROW EXECUTE FUNCTION "public"."fn_check_service_deletion_protection"();


--
-- Name: staff trg_check_staff_deletion_protection; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_check_staff_deletion_protection" BEFORE DELETE ON "public"."staff" FOR EACH ROW EXECUTE FUNCTION "public"."fn_check_staff_deletion_protection"();


--
-- Name: appointments trg_populate_appointment_snapshots; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_populate_appointment_snapshots" BEFORE INSERT OR UPDATE ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."fn_populate_appointment_snapshots"();


--
-- Name: appointments appointments_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;


--
-- Name: appointments appointments_salon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;


--
-- Name: appointments appointments_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE SET NULL;


--
-- Name: appointments appointments_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE SET NULL;


--
-- Name: clients clients_salon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;


--
-- Name: services services_salon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;


--
-- Name: staff staff_salon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;


--
-- Name: users users_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: users users_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."staff"("id") ON DELETE SET NULL;


--
-- Name: users users_salon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;


--
-- Name: appointments Appointments deletable only by owners; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Appointments deletable only by owners" ON "public"."appointments" FOR DELETE TO "authenticated" USING ("public"."is_owner"());


--
-- Name: appointments Appointments insertable by owner and receptionist; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Appointments insertable by owner and receptionist" ON "public"."appointments" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_owner_or_receptionist"());


--
-- Name: appointments Appointments updatable by owner, receptionist, or assigned empl; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Appointments updatable by owner, receptionist, or assigned empl" ON "public"."appointments" FOR UPDATE TO "authenticated" USING (("public"."is_owner_or_receptionist"() OR (("public"."current_user_role"() = 'EMPLOYEE'::"text") AND (("staff_id" = "public"."current_user_staff_id"()) OR ("assigned_employee_id" = "public"."current_user_staff_id"()))))) WITH CHECK (("public"."is_owner_or_receptionist"() OR (("public"."current_user_role"() = 'EMPLOYEE'::"text") AND (("staff_id" = "public"."current_user_staff_id"()) OR ("assigned_employee_id" = "public"."current_user_staff_id"())))));


--
-- Name: appointments Appointments viewable by staff according to isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Appointments viewable by staff according to isolation" ON "public"."appointments" FOR SELECT TO "authenticated" USING (("public"."is_owner_or_receptionist"() OR (("public"."current_user_role"() = 'EMPLOYEE'::"text") AND (("staff_id" = "public"."current_user_staff_id"()) OR ("assigned_employee_id" = "public"."current_user_staff_id"())))));


--
-- Name: clients Clients deletable only by owners; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Clients deletable only by owners" ON "public"."clients" FOR DELETE TO "authenticated" USING ("public"."is_owner"());


--
-- Name: clients Clients insertable by owner and receptionist; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Clients insertable by owner and receptionist" ON "public"."clients" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_owner_or_receptionist"());


--
-- Name: clients Clients updatable by owner and receptionist; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Clients updatable by owner and receptionist" ON "public"."clients" FOR UPDATE TO "authenticated" USING ("public"."is_owner_or_receptionist"()) WITH CHECK ("public"."is_owner_or_receptionist"());


--
-- Name: clients Clients viewable by authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Clients viewable by authenticated users" ON "public"."clients" FOR SELECT TO "authenticated" USING (("auth"."uid"() IS NOT NULL));


--
-- Name: salons Salons readable by authenticated salon users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Salons readable by authenticated salon users" ON "public"."salons" FOR SELECT TO "authenticated" USING (("auth"."uid"() IS NOT NULL));


--
-- Name: salons Salons updatable only by owners; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Salons updatable only by owners" ON "public"."salons" FOR UPDATE TO "authenticated" USING ("public"."is_owner"()) WITH CHECK ("public"."is_owner"());


--
-- Name: services Services deletable only by owners; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Services deletable only by owners" ON "public"."services" FOR DELETE TO "authenticated" USING ("public"."is_owner"());


--
-- Name: services Services insertable only by owners; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Services insertable only by owners" ON "public"."services" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_owner"());


--
-- Name: services Services updatable only by owners; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Services updatable only by owners" ON "public"."services" FOR UPDATE TO "authenticated" USING ("public"."is_owner"()) WITH CHECK ("public"."is_owner"());


--
-- Name: services Services viewable by authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Services viewable by authenticated users" ON "public"."services" FOR SELECT TO "authenticated" USING (("auth"."uid"() IS NOT NULL));


--
-- Name: staff Staff deletable only by owners; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff deletable only by owners" ON "public"."staff" FOR DELETE TO "authenticated" USING ("public"."is_owner"());


--
-- Name: staff Staff insertable only by owners; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff insertable only by owners" ON "public"."staff" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_owner"());


--
-- Name: staff Staff list viewable by authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff list viewable by authenticated users" ON "public"."staff" FOR SELECT TO "authenticated" USING (("auth"."uid"() IS NOT NULL));


--
-- Name: staff Staff updatable only by owners; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff updatable only by owners" ON "public"."staff" FOR UPDATE TO "authenticated" USING ("public"."is_owner"()) WITH CHECK ("public"."is_owner"());


--
-- Name: users Users deletable only by owners; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users deletable only by owners" ON "public"."users" FOR DELETE TO "authenticated" USING ("public"."is_owner"());


--
-- Name: users Users insertable only by owners; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users insertable only by owners" ON "public"."users" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_owner"());


--
-- Name: users Users updatable only by owners; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users updatable only by owners" ON "public"."users" FOR UPDATE TO "authenticated" USING ("public"."is_owner"()) WITH CHECK ("public"."is_owner"());


--
-- Name: users Users viewable by owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users viewable by owner" ON "public"."users" FOR SELECT TO "authenticated" USING ("public"."is_owner"());


--
-- Name: users Users viewable by self; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users viewable by self" ON "public"."users" FOR SELECT TO "authenticated" USING (("auth_user_id" = "auth"."uid"()));


--
-- Name: appointments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;

--
-- Name: clients; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;

--
-- Name: salons; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."salons" ENABLE ROW LEVEL SECURITY;

--
-- Name: services; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;

--
-- Name: staff; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."staff" ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "current_user_role"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."current_user_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "service_role";


--
-- Name: FUNCTION "current_user_staff_id"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."current_user_staff_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_user_staff_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_staff_id"() TO "service_role";


--
-- Name: FUNCTION "fn_check_client_deletion_protection"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."fn_check_client_deletion_protection"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_check_client_deletion_protection"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_check_client_deletion_protection"() TO "service_role";


--
-- Name: FUNCTION "fn_check_last_owner_protection"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."fn_check_last_owner_protection"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_check_last_owner_protection"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_check_last_owner_protection"() TO "service_role";


--
-- Name: FUNCTION "fn_check_service_deletion_protection"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."fn_check_service_deletion_protection"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_check_service_deletion_protection"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_check_service_deletion_protection"() TO "service_role";


--
-- Name: FUNCTION "fn_check_staff_deletion_protection"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."fn_check_staff_deletion_protection"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_check_staff_deletion_protection"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_check_staff_deletion_protection"() TO "service_role";


--
-- Name: FUNCTION "fn_populate_appointment_snapshots"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."fn_populate_appointment_snapshots"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_populate_appointment_snapshots"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_populate_appointment_snapshots"() TO "service_role";


--
-- Name: FUNCTION "is_owner"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."is_owner"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_owner"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_owner"() TO "service_role";


--
-- Name: FUNCTION "is_owner_or_receptionist"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."is_owner_or_receptionist"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_owner_or_receptionist"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_owner_or_receptionist"() TO "service_role";


--
-- Name: TABLE "appointments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."appointments" TO "service_role";


--
-- Name: TABLE "clients"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";


--
-- Name: TABLE "salons"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."salons" TO "authenticated";
GRANT ALL ON TABLE "public"."salons" TO "service_role";


--
-- Name: TABLE "services"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";


--
-- Name: TABLE "staff"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."staff" TO "authenticated";
GRANT ALL ON TABLE "public"."staff" TO "service_role";


--
-- Name: TABLE "users"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- PostgreSQL database dump complete
--

\unrestrict dHfPyOF1wRi4nepeKplvb1njLbBVqpMrdCNVErdU5eDajklTIfc9A2hn3LdbjlH

