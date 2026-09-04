/*
 * Kairoo API | sylvatica.my.id
 * © Dandy
 *
 * IP user tidak boleh disimpan mentah (lihat prompt update, poin 18 &
 * 32). Kita hanya menyimpan sha256(ip + salt) untuk keperluan hitung
 * "unique users" per hari — bukan untuk identifikasi individu.
 */
import crypto from 'crypto';

const SALT = process.env.MONITOR_IP_SALT || 'kairoo-monitor-default-salt';

export const hashIp = (ip: string): string => {
    return crypto.createHash('sha256').update(`${SALT}:${ip}`).digest('hex');
};
