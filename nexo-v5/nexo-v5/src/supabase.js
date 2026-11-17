import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ffefhfnnuubrdexgcyzp.supabase.co";

const supabaseKey = "sb_publishable_SJnRb4huQ-ChnjNaB2Sy7A_oPtUX8Xx";

export const supabase = createClient(supabaseUrl, supabaseKey);