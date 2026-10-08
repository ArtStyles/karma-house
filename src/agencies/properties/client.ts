import {supabase} from '../../lib/supabase';
import {createAgencyPropertyRepository} from './repository';
import {createAgencyPropertyMedia} from './media';
const url=process.env.EXPO_PUBLIC_SUPABASE_URL?.trim(),key=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
export const agencyPropertyRepository=supabase&&url&&key?createAgencyPropertyRepository(supabase,createAgencyPropertyMedia(url,key)):null;
