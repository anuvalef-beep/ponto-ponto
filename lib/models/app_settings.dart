class AlarmSettings {
  final String time; // HH:mm
  final bool enabled;
  final List<int> activeDays; // 1 = Monday, 7 = Sunday

  AlarmSettings({
    required this.time, 
    this.enabled = false,
    this.activeDays = const [1, 2, 3, 4, 5],
  });

  Map<String, dynamic> toMap() {
    return {'time': time, 'enabled': enabled, 'activeDays': activeDays};
  }

  factory AlarmSettings.fromMap(Map<String, dynamic> map) {
    return AlarmSettings(
      time: map['time'] ?? '08:00',
      enabled: map['enabled'] ?? false,
      activeDays: (map['activeDays'] as List<dynamic>?)?.cast<int>() ?? [1, 2, 3, 4, 5],
    );
  }
}

class AppSettings {
  final Map<String, AlarmSettings> alarms;
  final bool notificationsEnabled;

  AppSettings({
    Map<String, AlarmSettings>? alarms,
    this.notificationsEnabled = true,
  }) : alarms = alarms ?? {
          'entrada': AlarmSettings(time: '08:00'),
          'pausa': AlarmSettings(time: '12:00'),
          'retorno': AlarmSettings(time: '13:00'),
          'fim': AlarmSettings(time: '17:00'),
        };

  static AppSettings defaultSettings() => AppSettings();

  Map<String, dynamic> toMap() {
    return {
      'alarms': alarms.map((key, value) => MapEntry(key, value.toMap())),
      'notificationsEnabled': notificationsEnabled,
    };
  }

  factory AppSettings.fromMap(Map<String, dynamic> map) {
    final alarmsMap = (map['alarms'] as Map<String, dynamic>?)?.map(
          (key, value) => MapEntry(key, AlarmSettings.fromMap(value)),
        ) ??
        {};

    // Ensure default keys exist
    final defaultKeys = ['entrada', 'pausa', 'retorno', 'fim'];
    for (final key in defaultKeys) {
      alarmsMap.putIfAbsent(key, () => AlarmSettings(time: _getDefaultTime(key)));
    }

    return AppSettings(
      alarms: alarmsMap,
      notificationsEnabled: map['notificationsEnabled'] ?? true,
    );
  }

  static String _getDefaultTime(String key) {
    switch (key) {
      case 'entrada':
        return '08:00';
      case 'pausa':
        return '12:00';
      case 'retorno':
        return '13:00';
      case 'fim':
        return '17:00';
      default:
        return '00:00';
    }
  }
}
