import '../models/ponto_models.dart';

class PontoUtils {
  static Map<String, dynamic>? calculateWorkedHours(DayLog log) {
    if (log.isDayOff) return {'total': 'FOLGA', 'isDayOff': true};
    
    final punches = List<Punch>.from(log.punches)..sort((a, b) => a.timestamp.compareTo(b.timestamp));
    
    final entrada = punches.where((p) => p.type == PunchType.entrada).firstOrNull;
    if (entrada == null) return null;

    final fim = punches.where((p) => p.type == PunchType.fim).firstOrNull;
    if (fim == null) return null;

    final pausa = punches.where((p) => p.type == PunchType.pausa).firstOrNull;
    final retorno = punches.where((p) => p.type == PunchType.retorno).firstOrNull;

    int workedMs = 0;
    
    if (pausa != null && retorno != null && 
        pausa.timestamp.isBefore(retorno.timestamp) && 
        entrada.timestamp.isBefore(pausa.timestamp) && 
        retorno.timestamp.isBefore(fim.timestamp)) {
      workedMs = (pausa.timestamp.difference(entrada.timestamp).inMilliseconds) + 
                 (fim.timestamp.difference(retorno.timestamp).inMilliseconds);
    } else {
      workedMs = fim.timestamp.difference(entrada.timestamp).inMilliseconds;
    }

    final totalMinutes = workedMs / (1000 * 60);
    final hours = (totalMinutes / 60).floor();
    final minutes = (totalMinutes % 60).floor();
    
    final limitMinutes = 7 * 60 + 20; // 7:20
    final extraMinutes = totalMinutes > limitMinutes ? totalMinutes - limitMinutes : 0;
    final extraHours = (extraMinutes / 60).floor();
    final extraMins = (extraMinutes % 60).floor();

    return {
      'total': "${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}",
      'extra': extraMinutes > 0 
          ? "${extraHours.toString().padLeft(2, '0')}:${extraMins.toString().padLeft(2, '0')}" 
          : null,
      'totalMinutes': totalMinutes,
    };
  }
}
