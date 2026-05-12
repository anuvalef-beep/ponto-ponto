import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../widgets/glass_container.dart';
import '../theme/app_theme.dart';
import '../services/notification_service.dart';

class PermissionsScreen extends StatefulWidget {
  const PermissionsScreen({super.key});

  @override
  State<PermissionsScreen> createState() => _PermissionsScreenState();
}

class _PermissionsScreenState extends State<PermissionsScreen> {
  bool _notificationsGranted = false;
  bool _exactAlarmsGranted = false;
  bool _batteryOptimized = true;
  bool _systemAlertGranted = false;

  @override
  void initState() {
    super.initState();
    _checkPermissions();
  }

  Future<void> _checkPermissions() async {
    final notifStatus = await Permission.notification.status;
    final alarmStatus = await Permission.scheduleExactAlarm.status;
    final batteryStatus = await Permission.ignoreBatteryOptimizations.status;
    final systemAlertStatus = await Permission.systemAlertWindow.status;

    if (mounted) {
      setState(() {
        _notificationsGranted = notifStatus.isGranted;
        _exactAlarmsGranted = alarmStatus.isGranted;
        _batteryOptimized = !batteryStatus.isGranted;
        _systemAlertGranted = systemAlertStatus.isGranted;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Colors.grey.shade900,
              Colors.black,
            ],
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 20),
                const Icon(LucideIcons.shieldCheck, color: AppTheme.primaryColor, size: 48)
                    .animate()
                    .fadeIn()
                    .scale(),
                const SizedBox(height: 24),
                const Text(
                  'Configuração Necessária',
                  style: TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ).animate().fadeIn(delay: 200.ms).slideX(),
                const SizedBox(height: 8),
                Text(
                  'Para que os alarmes funcionem perfeitamente mesmo com o celular bloqueado, siga os passos abaixo:',
                  style: TextStyle(
                    fontSize: 16,
                    color: Colors.grey.shade400,
                  ),
                ).animate().fadeIn(delay: 400.ms),
                const SizedBox(height: 40),
                
                Expanded(
                  child: ListView(
                    children: [
                      _buildPermissionStep(
                        index: 1,
                        icon: LucideIcons.bell,
                        title: 'Notificações',
                        description: 'Permite que o app mostre os lembretes na tela.',
                        isGranted: _notificationsGranted,
                        onTap: () async {
                          await Permission.notification.request();
                          _checkPermissions();
                        },
                      ),
                      _buildPermissionStep(
                        index: 2,
                        icon: LucideIcons.alarmClock,
                        title: 'Alarmes Exatos',
                        description: 'Permite tocar exatamente no horário definido.',
                        isGranted: _exactAlarmsGranted,
                        onTap: () async {
                          await Permission.scheduleExactAlarm.request();
                          _checkPermissions();
                        },
                      ),
                      _buildPermissionStep(
                        index: 3,
                        icon: LucideIcons.batteryCharging,
                        title: 'Bateria Sem Restrições',
                        description: 'Evita que o sistema Android "mate" o alarme para economizar energia.',
                        isGranted: !_batteryOptimized,
                        onTap: () async {
                          await Permission.ignoreBatteryOptimizations.request();
                          _checkPermissions();
                        },
                      ),
                      _buildPermissionStep(
                        index: 4,
                        icon: LucideIcons.appWindow,
                        title: 'Sobrepor a Outros Apps',
                        description: 'Permite que a tela do alarme abra sozinha mesmo usando outro app.',
                        isGranted: _systemAlertGranted,
                        onTap: () async {
                          await Permission.systemAlertWindow.request();
                          _checkPermissions();
                        },
                      ),
                    ],
                  ),
                ),
                
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: OutlinedButton.icon(
                    onPressed: () {
                      NotificationService.testAlarm();
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Alarme de teste agendado para daqui a 10 segundos!')),
                      );
                    },
                    icon: const Icon(LucideIcons.playCircle),
                    label: const Text('TESTAR ALARME (10 SEG)'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.amber,
                      side: const BorderSide(color: Colors.amber),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
                  ),
                ).animate().fadeIn(delay: 900.ms),
                
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  height: 56,
                  child: ElevatedButton(
                    onPressed: () => Navigator.pop(context),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primaryColor,
                      foregroundColor: Colors.black,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
                    child: const Text(
                      'CONCLUIR CONFIGURAÇÃO',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                    ),
                  ),
                ).animate().fadeIn(delay: 800.ms).slideY(begin: 0.2),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildPermissionStep({
    required int index,
    required IconData icon,
    required String title,
    required String description,
    required bool isGranted,
    required VoidCallback onTap,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16.0),
      child: GlassContainer(
        child: ListTile(
          contentPadding: const EdgeInsets.all(16),
          leading: Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: isGranted ? Colors.green.withOpacity(0.2) : AppTheme.primaryColor.withOpacity(0.1),
              shape: BoxShape.circle,
            ),
            child: Center(
              child: isGranted 
                ? const Icon(LucideIcons.check, color: Colors.green, size: 20)
                : Text('$index', style: const TextStyle(color: AppTheme.primaryColor, fontWeight: FontWeight.bold)),
            ),
          ),
          title: Text(title, style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white)),
          subtitle: Text(description, style: TextStyle(color: Colors.grey.shade500, fontSize: 13)),
          trailing: isGranted 
            ? null 
            : TextButton(
                onPressed: onTap,
                child: const Text('ATIVAR', style: TextStyle(color: AppTheme.primaryColor, fontWeight: FontWeight.bold)),
              ),
        ),
      ),
    ).animate().fadeIn(delay: (200 * index).ms).slideX();
  }
}
