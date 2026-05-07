import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:signals_flutter/signals_flutter.dart';
import '../services/auth_service.dart';
import '../services/database_service.dart';
import '../services/notification_service.dart';
import '../signals/app_signals.dart';
import '../models/app_settings.dart';
import '../widgets/glass_container.dart';
import '../theme/app_theme.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Configurações', style: TextStyle(fontWeight: FontWeight.bold)),
        centerTitle: true,
      ),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          // Profile Section
          Watch((context) {
            final user = AppSignals.user.value;
            return GlassContainer(
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 30,
                      backgroundImage: user?.photoURL != null ? NetworkImage(user!.photoURL!) : null,
                      child: user?.photoURL == null ? const Icon(LucideIcons.user, size: 30) : null,
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            user?.displayName ?? 'Usuário',
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
                          ),
                          Text(
                            user?.email ?? '',
                            style: TextStyle(color: Colors.grey.shade500, fontSize: 14),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            );
          }),
          
          const SizedBox(height: 32),
          
          const Text('Lembretes de Ponto', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
          const SizedBox(height: 16),
          
          Watch((context) {
            final settings = AppSignals.settings.value;
            return Column(
              children: settings.alarms.entries.map((entry) {
                return _buildAlarmTile(
                  context,
                  type: entry.key,
                  settings: entry.value,
                );
              }).toList(),
            );
          }),
          
          const SizedBox(height: 32),
          const Text('Preferências', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
          
          const SizedBox(height: 32),
          
          const Text('Conta', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
          const SizedBox(height: 16),
          
          _buildSettingTile(
            context,
            icon: LucideIcons.logOut,
            title: 'Sair da Conta',
            titleColor: Colors.redAccent,
            onTap: () => AuthService().signOut(),
          ),
          
          const SizedBox(height: 48),
          
          Center(
            child: Column(
              children: [
                Text(
                  'Ponto & Frota Premium',
                  style: TextStyle(color: Colors.grey.shade600, fontWeight: FontWeight.bold),
                ),
                Text(
                  'Versão 1.0.0 (Flutter)',
                  style: TextStyle(color: Colors.grey.shade700, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAlarmTile(BuildContext context, {required String type, required AlarmSettings settings}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8.0),
      child: GlassContainer(
        child: ListTile(
          onTap: () => _selectTime(context, type, settings),
          leading: Icon(_getIconForType(type), color: AppTheme.primaryColor),
          title: Text(type.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.bold)),
          subtitle: Text('Toque para ajustar: ${settings.time}'),
          trailing: Switch(
            value: settings.enabled,
            onChanged: (val) => _toggleAlarm(type, settings, val),
            activeColor: AppTheme.primaryColor,
          ),
        ),
      ),
    );
  }

  Future<void> _selectTime(BuildContext context, String type, AlarmSettings settings) async {
    final parts = settings.time.split(':');
    final initialTime = TimeOfDay(hour: int.parse(parts[0]), minute: int.parse(parts[1]));
    
    final TimeOfDay? picked = await showTimePicker(
      context: context,
      initialTime: initialTime,
    );
    
    if (picked != null) {
      final newTime = "${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}";
      _updateAlarm(type, AlarmSettings(time: newTime, enabled: settings.enabled));
    }
  }

  void _toggleAlarm(String type, AlarmSettings settings, bool enabled) {
    _updateAlarm(type, AlarmSettings(time: settings.time, enabled: enabled));
  }

  void _updateAlarm(String type, AlarmSettings newAlarm) {
    final currentSettings = AppSignals.settings.value;
    final newAlarms = Map<String, AlarmSettings>.from(currentSettings.alarms);
    newAlarms[type] = newAlarm;
    
    final updatedSettings = AppSettings(
      alarms: newAlarms,
      notificationsEnabled: currentSettings.notificationsEnabled,
    );
    
    AppSignals.settings.value = updatedSettings;
    
    // Save to Database
    if (AppSignals.user.value != null) {
      DatabaseService(uid: AppSignals.user.value!.uid).saveSettings(updatedSettings);
    }

    // Schedule/Cancel Notification
    if (newAlarm.enabled) {
      NotificationService.scheduleAlarm(
        id: type.hashCode,
        title: 'Lembrete de Ponto',
        body: 'Está na hora da sua batida de $type!',
        time: newAlarm.time,
      );
    } else {
      NotificationService.cancelAlarm(type.hashCode);
    }
  }

  IconData _getIconForType(String type) {
    switch (type) {
      case 'entrada': return LucideIcons.play;
      case 'pausa': return LucideIcons.pause;
      case 'retorno': return LucideIcons.rotateCcw;
      case 'fim': return LucideIcons.square;
      default: return LucideIcons.bell;
    }
  }

  Widget _buildSettingTile(BuildContext context, {
    required IconData icon, 
    required String title, 
    Widget? trailing, 
    VoidCallback? onTap,
    Color? titleColor,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8.0),
      child: GlassContainer(
        child: ListTile(
          onTap: onTap,
          leading: Icon(icon, color: titleColor ?? Colors.grey.shade400),
          title: Text(title, style: TextStyle(color: titleColor, fontWeight: FontWeight.w500)),
          trailing: trailing,
        ),
      ),
    );
  }
}
