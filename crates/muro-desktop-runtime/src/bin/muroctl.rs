fn main() {
    if let Err(error) = muro_desktop_runtime::cli::main_args(std::env::args().skip(1).collect()) {
        eprintln!("{error:#}");
        std::process::exit(1);
    }
}
